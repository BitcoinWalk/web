package controllers

// Exercises actual NWC pay controller + Hub transaction database with an
// injected backend fault. No relay, wallet, network or real funds are used.
import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/btcsuite/btcd/btcec/v2"
	"github.com/btcsuite/btcd/btcec/v2/ecdsa"
	"github.com/btcsuite/btcd/chaincfg"
	"github.com/btcsuite/btcd/chaincfg/chainhash"
	"github.com/getAlby/go-nostr"
	"github.com/getAlby/hub/constants"
	"github.com/getAlby/hub/db"
	"github.com/getAlby/hub/db/queries"
	"github.com/getAlby/hub/lnclient"
	"github.com/getAlby/hub/nip47/models"
	"github.com/getAlby/hub/tests"
	"github.com/lightningnetwork/lnd/lnwire"
	"github.com/lightningnetwork/lnd/zpay32"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type bwFaultBackend struct {
	lnclient.LNClient
	send func(string, *uint64, *uint64) (*lnclient.PayInvoiceResponse, error)
}

func (b bwFaultBackend) SendPaymentSync(i string, a, f *uint64) (*lnclient.PayInvoiceResponse, error) {
	return b.send(i, a, f)
}

func bwRecoveryService(t *testing.T) *tests.TestService {
	t.Helper()
	if os.Getenv("BW_CRASH_CHILD") != "1" {
		t.Setenv("TEST_DATABASE_URI", filepath.Join(t.TempDir(), "fixture.db"))
	}
	svc, err := tests.CreateTestService(t)
	require.NoError(t, err)
	t.Cleanup(svc.Remove)
	return svc
}
func bwRecoveryApp(t *testing.T, svc *tests.TestService) (*db.App, *db.AppPermission) {
	t.Helper()
	app, _, err := tests.CreateApp(svc)
	require.NoError(t, err)
	perm := &db.AppPermission{AppId: app.ID, Scope: constants.PAY_INVOICE_SCOPE, MaxAmountSat: 200000}
	require.NoError(t, svc.DB.Create(perm).Error)
	return app, perm
}
func bwInvoice(t *testing.T, n int) (string, string, string) {
	t.Helper()
	pre := sha256.Sum256([]byte(fmt.Sprintf("bw-no-funds-invoice-%d", n)))
	hash := sha256.Sum256(pre[:])
	key, err := btcec.NewPrivateKey()
	require.NoError(t, err)
	inv, err := zpay32.NewInvoice(&chaincfg.RegressionNetParams, hash, time.Now(), zpay32.Amount(lnwire.MilliSatoshi(50_000_000)), zpay32.Description("no-funds recovery fixture"))
	require.NoError(t, err)
	encoded, err := inv.Encode(zpay32.MessageSigner{SignCompact: func(msg []byte) ([]byte, error) { return ecdsa.SignCompact(key, chainhash.HashB(msg), true), nil }})
	require.NoError(t, err)
	return encoded, hex.EncodeToString(hash[:]), hex.EncodeToString(pre[:])
}
func bwPayRequest(t *testing.T, svc *tests.TestService, invoice string) (*models.Request, uint) {
	t.Helper()
	params, err := json.Marshal(map[string]any{"invoice": invoice, "max_fee": 100000})
	require.NoError(t, err)
	var eventID [32]byte
	_, err = rand.Read(eventID[:])
	require.NoError(t, err)
	row := &db.RequestEvent{NostrId: hex.EncodeToString(eventID[:])}
	require.NoError(t, svc.DB.Create(row).Error)
	return &models.Request{Method: "pay_invoice", Params: params}, row.ID
}
func bwInvoke(svc *tests.TestService, app *db.App, req *models.Request, id uint) *models.Response {
	var res *models.Response
	NewTestNip47Controller(svc).HandlePayInvoiceEvent(context.Background(), req, id, app, func(r *models.Response, _ nostr.Tags) { res = r }, nostr.Tags{})
	return res
}

func TestBitcoinWalkConcurrentNwcBudget(t *testing.T) {
	svc := bwRecoveryService(t)
	app, perm := bwRecoveryApp(t, svc)
	const count = 20
	requests := make([]*models.Request, count)
	ids := make([]uint, count)
	preimages := map[string]string{}
	for i := 0; i < count; i++ {
		inv, _, pre := bwInvoice(t, i)
		requests[i], ids[i] = bwPayRequest(t, svc, inv)
		preimages[inv] = pre
	}
	entered := make(chan struct{}, count)
	results := make(chan *models.Response, count)
	release := make(chan struct{})
	var once sync.Once
	unblock := func() { once.Do(func() { close(release) }) }
	t.Cleanup(unblock)
	var calls atomic.Int32
	svc.LNClient = bwFaultBackend{LNClient: svc.LNClient, send: func(inv string, a, f *uint64) (*lnclient.PayInvoiceResponse, error) {
		calls.Add(1)
		entered <- struct{}{}
		<-release
		if f == nil || *f != 100000 {
			return nil, errors.New("fixture fee cap mismatch")
		}
		return &lnclient.PayInvoiceResponse{Preimage: preimages[inv], FeeMsat: 100000}, nil
	}}
	start := make(chan struct{})
	var wg sync.WaitGroup
	for i := 0; i < count; i++ {
		wg.Add(1)
		go func(i int) { defer wg.Done(); <-start; results <- bwInvoke(svc, app, requests[i], ids[i]) }(i)
	}
	close(start)
	for i := 0; i < 3; i++ {
		select {
		case <-entered:
		case <-time.After(15 * time.Second):
			t.Fatal("three reservations were not admitted")
		}
	}
	// 20 simultaneous 50,100-sat reservations: only three fit the 200,000-sat budget.
	for i := 0; i < count-3; i++ {
		select {
		case r := <-results:
			require.NotNil(t, r)
			require.NotNil(t, r.Error)
			require.Equal(t, constants.ERROR_QUOTA_EXCEEDED, r.Error.Code)
		case <-time.After(15 * time.Second):
			t.Fatal("over-budget calls did not return")
		}
	}
	require.Equal(t, int32(3), calls.Load())
	usage, err := queries.GetBudgetUsageMsat(svc.DB, perm)
	require.NoError(t, err)
	require.Equal(t, uint64(150300000), usage)
	unblock()
	wg.Wait()
	for i := 0; i < 3; i++ {
		r := <-results
		require.NotNil(t, r)
		require.Nil(t, r.Error)
	}
	usage, err = queries.GetBudgetUsageMsat(svc.DB, perm)
	require.NoError(t, err)
	require.Equal(t, uint64(150300000), usage)
	t.Log("20 concurrent NWC controller calls: 3 paid, 17 quota-rejected; exact pending/settled budget includes fees")
}

func TestBitcoinWalkUncertainSendMustRetainReservation(t *testing.T) {
	for _, fault := range []error{context.Canceled, context.DeadlineExceeded} {
		t.Run(fault.Error(), func(t *testing.T) {
			svc := bwRecoveryService(t)
			app, perm := bwRecoveryApp(t, svc)
			inv, hash, _ := bwInvoice(t, 100)
			req, id := bwPayRequest(t, svc, inv)
			// The fake backend accepts the attempt, but does not provide a terminal outcome.
			svc.LNClient = bwFaultBackend{LNClient: svc.LNClient, send: func(string, *uint64, *uint64) (*lnclient.PayInvoiceResponse, error) { return nil, fault }}
			res := bwInvoke(svc, app, req, id)
			require.NotNil(t, res)
			require.NotNil(t, res.Error)
			var row db.Transaction
			require.NoError(t, svc.DB.Where("payment_hash = ? AND type = ?", hash, constants.TRANSACTION_TYPE_OUTGOING).First(&row).Error)
			usage, err := queries.GetBudgetUsageMsat(svc.DB, perm)
			require.NoError(t, err)
			assert.Equal(t, constants.TRANSACTION_STATE_PENDING, row.State, "unknown outcome must not be declared failed")
			assert.Equal(t, uint64(100000), row.FeeReserveMsat, "unknown fee reservation must remain")
			assert.Equal(t, uint64(50100000), usage, "unknown principal and fee must count against budget")
			var retried atomic.Int32
			svc.LNClient = bwFaultBackend{LNClient: svc.LNClient, send: func(string, *uint64, *uint64) (*lnclient.PayInvoiceResponse, error) {
				retried.Add(1)
				return nil, fault
			}}
			req, id = bwPayRequest(t, svc, inv)
			_ = bwInvoke(svc, app, req, id)
			assert.Zero(t, retried.Load(), "retry reached backend before unknown first attempt was reconciled")
		})
	}
}

func TestBitcoinWalkLostNwcResponseAfterSettlement(t *testing.T) {
	svc := bwRecoveryService(t)
	app, perm := bwRecoveryApp(t, svc)
	inv, hash, preimage := bwInvoice(t, 300)
	var calls atomic.Int32
	svc.LNClient = bwFaultBackend{LNClient: svc.LNClient, send: func(string, *uint64, *uint64) (*lnclient.PayInvoiceResponse, error) {
		calls.Add(1)
		return &lnclient.PayInvoiceResponse{Preimage: preimage, FeeMsat: 100000}, nil
	}}
	req, id := bwPayRequest(t, svc, inv)
	// Discard the outgoing response callback: the client never observes success.
	NewTestNip47Controller(svc).HandlePayInvoiceEvent(context.Background(), req, id, app, func(*models.Response, nostr.Tags) {}, nostr.Tags{})
	var row db.Transaction
	require.NoError(t, svc.DB.Where("payment_hash = ? AND type = ?", hash, constants.TRANSACTION_TYPE_OUTGOING).First(&row).Error)
	require.Equal(t, constants.TRANSACTION_STATE_SETTLED, row.State)
	req, id = bwPayRequest(t, svc, inv)
	res := bwInvoke(svc, app, req, id)
	require.NotNil(t, res.Error)
	require.Equal(t, int32(1), calls.Load(), "lost response must not cause another backend call")
	usage, err := queries.GetBudgetUsageMsat(svc.DB, perm)
	require.NoError(t, err)
	require.Equal(t, uint64(50100000), usage)
	t.Log("discarded success response: fresh controller rejects duplicate and retains settled budget")
}

func TestBitcoinWalkAbruptProcessRecovery(t *testing.T) {
	if os.Getenv("BW_CRASH_CHILD") == "1" {
		svc := bwRecoveryService(t)
		var app db.App
		require.NoError(t, svc.DB.First(&app).Error)
		svc.LNClient = bwFaultBackend{LNClient: svc.LNClient, send: func(string, *uint64, *uint64) (*lnclient.PayInvoiceResponse, error) { os.Exit(23); return nil, nil }}
		req, id := bwPayRequest(t, svc, os.Getenv("BW_FIXTURE_INVOICE"))
		bwInvoke(svc, &app, req, id)
		t.Fatal("child did not exit")
	}
	svc := bwRecoveryService(t)
	app, perm := bwRecoveryApp(t, svc)
	inv, hash, _ := bwInvoice(t, 200)
	cmd := exec.Command(os.Args[0], "-test.run=^TestBitcoinWalkAbruptProcessRecovery$", "-test.timeout=30s")
	cmd.Env = append(os.Environ(), "BW_CRASH_CHILD=1", "BW_FIXTURE_INVOICE="+inv)
	err := cmd.Run()
	var exit *exec.ExitError
	require.ErrorAs(t, err, &exit)
	require.Equal(t, 23, exit.ExitCode())
	var row db.Transaction
	require.NoError(t, svc.DB.Where("payment_hash = ? AND type = ?", hash, constants.TRANSACTION_TYPE_OUTGOING).First(&row).Error)
	require.Equal(t, constants.TRANSACTION_STATE_PENDING, row.State)
	require.Equal(t, uint64(100000), row.FeeReserveMsat)
	usage, err := queries.GetBudgetUsageMsat(svc.DB, perm)
	require.NoError(t, err)
	require.Equal(t, uint64(50100000), usage)
	var calls atomic.Int32
	svc.LNClient = bwFaultBackend{LNClient: svc.LNClient, send: func(string, *uint64, *uint64) (*lnclient.PayInvoiceResponse, error) {
		calls.Add(1)
		return nil, errors.New("must not send")
	}}
	req, id := bwPayRequest(t, svc, inv)
	res := bwInvoke(svc, app, req, id)
	require.NotNil(t, res.Error)
	require.Zero(t, calls.Load())
	t.Log("abrupt child-process exit preserved pending reservation; reconstructed controller blocked resend")
}

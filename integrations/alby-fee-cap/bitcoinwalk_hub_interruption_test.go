package service_test

// Opt-in, private regtest only. This test is copied into the patched Hub
// candidate's service package by run-hub-interruption.py. It starts a complete
// Hub service in child processes, kills one while a native-LDK payment is held,
// then proves restart reconciliation and duplicate-send rejection.
import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strconv"
	"syscall"
	"testing"
	"time"

	"github.com/getAlby/hub/api"
	"github.com/getAlby/hub/config"
	"github.com/getAlby/hub/constants"
	"github.com/getAlby/hub/db"
	"github.com/getAlby/hub/service"
	ldk "github.com/getAlby/ldk-node-go/ldk_node"
	"github.com/stretchr/testify/require"
)

const (
	fixturePassword = "bitcoinwalk-private-regtest-only"
	fixtureMnemonic = "thought turkey ask pottery head say catalog desk pledge elbow naive mimic"
)

type hubFixture struct {
	WorkDir      string `json:"workDir"`
	RPCPort      string `json:"rpcPort"`
	HubListen    string `json:"hubListen"`
	FundingAddr  string `json:"fundingAddr"`
	HubPubkey    string `json:"hubPubkey"`
	RouterPubkey string `json:"routerPubkey"`
	RouterAddr   string `json:"routerAddr"`
	ReceiverKey  string `json:"receiverPubkey"`
	Invoice      string `json:"invoice"`
	PaymentHash  string `json:"paymentHash"`
	ResultPath   string `json:"resultPath"`
}

type hubResult struct {
	State          string `json:"state"`
	AmountMsat     uint64 `json:"amountMsat"`
	FeeMsat        uint64 `json:"feeMsat"`
	FeeReserveMsat uint64 `json:"feeReserveMsat"`
	OutgoingRows   int64  `json:"outgoingRows"`
	BudgetUsedMsat uint64 `json:"budgetUsedMsat"`
	RetryRejected  bool   `json:"retryRejected"`
}

func TestBitcoinWalkCompleteHubNativeInterruption(t *testing.T) {
	if mode := os.Getenv("BW_HUB_CHILD_MODE"); mode != "" {
		runHubChild(t, mode)
		return
	}
	bitcoind := os.Getenv("BW_REGTEST_BITCOIND")
	if bitcoind == "" {
		t.Skip("explicit private-regtest opt-in required")
	}
	require.NotZero(t, os.Getuid(), "non-root only")

	dir := t.TempDir()
	rpcPort := freePort(t)
	bitcoinDir := filepath.Join(dir, "bitcoin")
	require.NoError(t, os.MkdirAll(bitcoinDir, 0o700))
	bitcoin := exec.Command(bitcoind,
		"-regtest", "-datadir="+bitcoinDir, "-server",
		"-listen=0", "-connect=0", "-dnsseed=0", "-discover=0",
		"-rpcbind=127.0.0.1", "-rpcallowip=127.0.0.1", "-rpcport="+rpcPort,
		"-rpcuser=fixture", "-rpcpassword=regtest-only", "-fallbackfee=0.0002",
		"-printtoconsole=0")
	require.NoError(t, bitcoin.Start())
	t.Cleanup(func() {
		_ = bitcoin.Process.Signal(os.Interrupt)
		_ = bitcoin.Wait()
	})
	rpc := newBitcoinRPC(rpcPort)
	waitFor(t, "private chain startup", 90*time.Second, func() bool {
		_, err := rpc("getblockchaininfo")
		return err == nil
	})
	_, err := rpc("createwallet", "fixture")
	require.NoError(t, err)
	miningRaw, err := rpc("getnewaddress")
	require.NoError(t, err)
	var miningAddress string
	require.NoError(t, json.Unmarshal(miningRaw, &miningAddress))
	mine := func(n int) {
		_, mineErr := rpc("generatetoaddress", n, miningAddress)
		require.NoError(t, mineErr)
	}
	mine(101)

	routerAddr := "127.0.0.1:" + freePort(t)
	receiverAddr := "127.0.0.1:" + freePort(t)
	router := buildRawNode(t, filepath.Join(dir, "router"), routerAddr, rpcPort, "router")
	receiver := buildRawNode(t, filepath.Join(dir, "receiver"), receiverAddr, rpcPort, "receiver")
	t.Cleanup(func() { _ = router.Stop(); _ = receiver.Stop() })

	fixturePath := filepath.Join(dir, "fixture.json")
	fx := hubFixture{
		WorkDir:      filepath.Join(dir, "hub"),
		RPCPort:      rpcPort,
		HubListen:    "127.0.0.1:" + freePort(t),
		RouterPubkey: router.NodeId(),
		RouterAddr:   routerAddr,
		ReceiverKey:  receiver.NodeId(),
		ResultPath:   filepath.Join(dir, "result.json"),
	}
	writeJSON(t, fixturePath, &fx)
	runChild(t, fixturePath, "bootstrap", true)
	readJSON(t, fixturePath, &fx)
	require.Len(t, fx.HubPubkey, 66)

	for _, node := range []*ldk.Node{router} {
		address, addressErr := node.OnchainPayment().NewAddress()
		require.NoError(t, addressErr)
		_, sendErr := rpc("sendtoaddress", address, 1)
		require.NoError(t, sendErr)
	}
	_, err = rpc("sendtoaddress", fx.FundingAddr, 1)
	require.NoError(t, err)
	mine(6)
	require.NoError(t, router.SyncWallets())
	require.NoError(t, receiver.SyncWallets())

	_, err = router.OpenAnnouncedChannel(receiver.NodeId(), receiverAddr, 500_000, nil, nil)
	require.NoError(t, err)
	waitMempool(t, rpc, 1)
	mine(6)
	waitFor(t, "router/receiver channel", 90*time.Second, func() bool {
		pumpRaw(t, router, nil)
		pumpRaw(t, receiver, nil)
		_ = router.SyncWallets()
		_ = receiver.SyncWallets()
		return hasUsableChannel(router, receiver.NodeId()) && hasUsableChannel(receiver, router.NodeId())
	})

	runChild(t, fixturePath, "channel", true)
	waitMempool(t, rpc, 1)
	mine(6)
	waitFor(t, "router/hub channel", 120*time.Second, func() bool {
		pumpRaw(t, router, nil)
		_ = router.SyncWallets()
		return hasChannel(router, fx.HubPubkey)
	})

	for _, channel := range router.ListChannels() {
		if channel.CounterpartyNodeId == receiver.NodeId() {
			cfg := channel.Config
			cfg.ForwardingFeeBaseMsat = 100_000
			cfg.ForwardingFeeProportionalMillionths = 0
			require.NoError(t, router.UpdateChannelConfig(channel.UserChannelId, channel.CounterpartyNodeId, cfg))
		}
	}
	waitFor(t, "receiver sees exact routing fee", 90*time.Second, func() bool {
		pumpRaw(t, router, nil)
		pumpRaw(t, receiver, nil)
		for _, channel := range receiver.ListChannels() {
			if channel.CounterpartyNodeId == router.NodeId() && channel.CounterpartyForwardingInfoFeeBaseMsat != nil {
				return *channel.CounterpartyForwardingInfoFeeBaseMsat == 100_000
			}
		}
		return false
	})

	preimage := make([]byte, 32)
	_, err = rand.Read(preimage)
	require.NoError(t, err)
	hash := sha256.Sum256(preimage)
	fx.PaymentHash = hex.EncodeToString(hash[:])
	invoice, err := receiver.Bolt11Payment().ReceiveForHash(50_000_000, ldk.Bolt11InvoiceDescriptionDirect{Description: "BitcoinWalk interruption fixture"}, 3600, fx.PaymentHash)
	require.NoError(t, err)
	fx.Invoice = invoice.String()
	writeJSON(t, fixturePath, &fx)

	payCmd := childCommand(fixturePath, "pay")
	require.NoError(t, payCmd.Start())
	claimable := false
	waitFor(t, "held payment reaches receiver", 150*time.Second, func() bool {
		pumpRaw(t, router, nil)
		pumpRaw(t, receiver, func(event ldk.Event) bool {
			if payment, ok := event.(ldk.EventPaymentClaimable); ok && payment.PaymentHash == fx.PaymentHash {
				claimable = true
				return false
			}
			return true
		})
		return claimable
	})
	require.NoError(t, payCmd.Process.Signal(syscall.SIGKILL))
	_ = payCmd.Wait()
	t.Log("complete Hub process killed while native-LDK payment was claimable but unsettled")

	recoverCmd := childCommand(fixturePath, "recover")
	require.NoError(t, recoverCmd.Start())
	waitFor(t, "restarted Hub confirms pending reservation", 120*time.Second, func() bool {
		_, statErr := os.Stat(fx.ResultPath + ".ready")
		return statErr == nil
	})
	require.NoError(t, receiver.Bolt11Payment().ClaimForHash(fx.PaymentHash, 50_000_000, hex.EncodeToString(preimage)))
	require.NoError(t, receiver.EventHandled())
	require.NoError(t, recoverCmd.Wait())

	var result hubResult
	readJSON(t, fx.ResultPath, &result)
	require.Equal(t, constants.TRANSACTION_STATE_SETTLED, result.State)
	require.Equal(t, uint64(50_000_000), result.AmountMsat)
	require.Equal(t, uint64(100_000), result.FeeMsat)
	require.Zero(t, result.FeeReserveMsat)
	require.Equal(t, int64(1), result.OutgoingRows)
	require.Equal(t, uint64(50_100_000), result.BudgetUsedMsat)
	require.True(t, result.RetryRejected)
	t.Log("restart reconciled the exact payment and rejected a duplicate without a second outgoing row")
}

func runHubChild(t *testing.T, mode string) {
	require.NotZero(t, os.Getuid(), "non-root only")
	fixturePath := os.Getenv("BW_HUB_FIXTURE")
	require.NotEmpty(t, fixturePath)
	var fx hubFixture
	readJSON(t, fixturePath, &fx)
	setHubEnvironment(t, &fx)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	svc, err := service.NewService(ctx)
	require.NoError(t, err)
	hubAPI := api.NewAPI(svc, svc.GetDB(), svc.GetConfig(), svc.GetKeys(), svc.GetAlbySvc(), svc.GetAlbyOAuthSvc(), svc.GetEventPublisher())

	if mode == "bootstrap" {
		require.NoError(t, hubAPI.Setup(ctx, &api.SetupRequest{LNBackendType: config.LDKBackendType, UnlockPassword: fixturePassword, Mnemonic: fixtureMnemonic}))
	}
	require.NoError(t, svc.StartApp(fixturePassword))
	if mode != "pay" {
		defer svc.Shutdown()
	}
	ln := svc.GetLNClient()
	require.NotNil(t, ln)

	switch mode {
	case "bootstrap":
		info, infoErr := ln.GetInfo(ctx)
		require.NoError(t, infoErr)
		fx.HubPubkey = info.Pubkey
		fx.FundingAddr, err = ln.GetNewOnchainAddress(ctx)
		require.NoError(t, err)
		writeJSON(t, fixturePath, &fx)
	case "channel":
		require.NoError(t, hubAPI.ConnectPeer(ctx, &api.ConnectPeerRequest{Pubkey: fx.RouterPubkey, Address: "127.0.0.1", Port: parsePort(t, fx.RouterAddr)}))
		_, err = hubAPI.OpenChannel(ctx, &api.OpenChannelRequest{Pubkey: fx.RouterPubkey, AmountSats: 500_000, Public: true})
		require.NoError(t, err)
	case "pay":
		require.NoError(t, hubAPI.ConnectPeer(ctx, &api.ConnectPeerRequest{Pubkey: fx.RouterPubkey, Address: "127.0.0.1", Port: parsePort(t, fx.RouterAddr)}))
		waitChild(t, "Hub route graph", 150*time.Second, func() bool {
			graph, graphErr := ln.GetNetworkGraph(ctx, []string{fx.RouterPubkey, fx.ReceiverKey})
			if graphErr != nil {
				return false
			}
			m, ok := graph.(map[string]interface{})
			if !ok {
				return false
			}
			nodes := reflect.ValueOf(m["nodes"])
			return nodes.IsValid() && nodes.Kind() == reflect.Slice && nodes.Len() == 2
		})
		appID := ensureFixtureApp(t, hubAPI, svc)
		capMsat := uint64(100_000)
		_, err = hubAPI.SendPayment(ctx, fx.Invoice, nil, &capMsat, map[string]interface{}{"fixture": "complete-hub-interruption"}, &appID)
		if err != nil {
			t.Fatalf("payment returned before process interruption: %v", err)
		}
		t.Fatal("held payment unexpectedly settled before interruption")
	case "recover":
		require.NoError(t, hubAPI.ConnectPeer(ctx, &api.ConnectPeerRequest{Pubkey: fx.RouterPubkey, Address: "127.0.0.1", Port: parsePort(t, fx.RouterAddr)}))
		appID := fixtureAppID(t, svc)
		var pending db.Transaction
		require.NoError(t, svc.GetDB().Where("payment_hash = ? AND type = ?", fx.PaymentHash, constants.TRANSACTION_TYPE_OUTGOING).First(&pending).Error)
		require.Equal(t, constants.TRANSACTION_STATE_PENDING, pending.State)
		require.Equal(t, uint64(50_000_000), pending.AmountMsat)
		require.Equal(t, uint64(100_000), pending.FeeReserveMsat)
		require.NoError(t, os.WriteFile(fx.ResultPath+".ready", []byte("ready\n"), 0o600))
		outgoing := constants.TRANSACTION_TYPE_OUTGOING
		var reconciled *db.Transaction
		waitChild(t, "exact post-restart reconciliation", 150*time.Second, func() bool {
			var lookupErr error
			reconciled, lookupErr = svc.GetTransactionsService().LookupTransaction(ctx, fx.PaymentHash, &outgoing, ln, &appID)
			return lookupErr == nil && reconciled.State == constants.TRANSACTION_STATE_SETTLED
		})
		capMsat := uint64(100_000)
		_, retryErr := hubAPI.SendPayment(ctx, fx.Invoice, nil, &capMsat, nil, &appID)
		var rows int64
		require.NoError(t, svc.GetDB().Model(&db.Transaction{}).Where("payment_hash = ? AND type = ?", fx.PaymentHash, outgoing).Count(&rows).Error)
		var permission db.AppPermission
		require.NoError(t, svc.GetDB().Where("app_id = ? AND scope = ?", appID, constants.PAY_INVOICE_SCOPE).First(&permission).Error)
		var used struct{ Sum uint64 }
		require.NoError(t, svc.GetDB().Table("transactions").Select("SUM(amount_msat + fee_msat + fee_reserve_msat) AS sum").Where("app_id = ? AND type = ? AND state IN ?", appID, outgoing, []string{constants.TRANSACTION_STATE_PENDING, constants.TRANSACTION_STATE_SETTLED}).Scan(&used).Error)
		writeJSON(t, fx.ResultPath, &hubResult{State: reconciled.State, AmountMsat: reconciled.AmountMsat, FeeMsat: reconciled.FeeMsat, FeeReserveMsat: reconciled.FeeReserveMsat, OutgoingRows: rows, BudgetUsedMsat: used.Sum, RetryRejected: retryErr != nil})
	default:
		t.Fatalf("unknown child mode %q", mode)
	}
}

func ensureFixtureApp(t *testing.T, hubAPI api.API, svc service.Service) uint {
	var app db.App
	if err := svc.GetDB().Where("name = ?", "BitcoinWalk recovery fixture").First(&app).Error; err == nil {
		return app.ID
	}
	max := uint64(200_000)
	created, err := hubAPI.CreateApp(&api.CreateAppRequest{Name: "BitcoinWalk recovery fixture", MaxAmountSat: &max, BudgetRenewal: constants.BUDGET_RENEWAL_NEVER, Scopes: []string{constants.PAY_INVOICE_SCOPE}})
	require.NoError(t, err)
	return created.Id
}

func fixtureAppID(t *testing.T, svc service.Service) uint {
	var app db.App
	require.NoError(t, svc.GetDB().Where("name = ?", "BitcoinWalk recovery fixture").First(&app).Error)
	return app.ID
}

func setHubEnvironment(t *testing.T, fx *hubFixture) {
	t.Helper()
	for key, value := range map[string]string{
		"WORK_DIR": fx.WorkDir, "DATABASE_URI": filepath.Join(fx.WorkDir, "nwc.db"),
		"NETWORK": "regtest", "LDK_NETWORK": "regtest", "LOG_TO_FILE": "false", "LOG_LEVEL": "2",
		"LDK_LOG_LEVEL": "2", "LDK_BITCOIND_RPC_HOST": "127.0.0.1", "LDK_BITCOIND_RPC_PORT": fx.RPCPort,
		"LDK_BITCOIND_RPC_USER": "fixture", "LDK_BITCOIND_RPC_PASSWORD": "regtest-only",
		"LDK_LISTENING_ADDRESSES": fx.HubListen, "LDK_ANNOUNCEMENT_ADDRESSES": fx.HubListen,
		"LDK_TRANSIENT_NETWORK_GRAPH": "false", "RELAY": "ws://127.0.0.1:1",
		"SEND_EVENTS_TO_ALBY": "false", "AUTO_LINK_ALBY_ACCOUNT": "false", "MEMPOOL_API": "http://127.0.0.1:1",
	} {
		require.NoError(t, os.Setenv(key, value))
	}
	http.DefaultTransport = denyExternalTransport{base: http.DefaultTransport}
}

type denyExternalTransport struct{ base http.RoundTripper }

func (transport denyExternalTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	host, _, _ := net.SplitHostPort(req.URL.Host)
	if host == "127.0.0.1" || req.URL.Hostname() == "127.0.0.1" || req.URL.Hostname() == "localhost" {
		return transport.base.RoundTrip(req)
	}
	return nil, errors.New("private fixture blocked external HTTP request")
}

func buildRawNode(t *testing.T, dir, address, rpcPort, alias string) *ldk.Node {
	t.Helper()
	builder := ldk.NewBuilder()
	builder.SetNetwork(ldk.NetworkRegtest)
	builder.SetStorageDirPath(dir)
	require.NoError(t, builder.SetListeningAddresses([]string{address}))
	require.NoError(t, builder.SetAnnouncementAddresses([]string{address}))
	require.NoError(t, builder.SetNodeAlias(alias))
	port, err := strconv.ParseUint(rpcPort, 10, 16)
	require.NoError(t, err)
	builder.SetChainSourceBitcoindRpc("127.0.0.1", uint16(port), "fixture", "regtest-only")
	node, err := builder.Build()
	require.NoError(t, err)
	require.NoError(t, node.Start())
	return node
}

func pumpRaw(t *testing.T, node *ldk.Node, handle func(ldk.Event) bool) {
	t.Helper()
	for event := node.NextEvent(); event != nil; event = node.NextEvent() {
		if handle == nil || handle(*event) {
			require.NoError(t, node.EventHandled())
		} else {
			return
		}
	}
}

func hasUsableChannel(node *ldk.Node, peer string) bool {
	for _, channel := range node.ListChannels() {
		if channel.CounterpartyNodeId == peer && channel.IsUsable {
			return true
		}
	}
	return false
}

func hasChannel(node *ldk.Node, peer string) bool {
	for _, channel := range node.ListChannels() {
		if channel.CounterpartyNodeId == peer {
			return true
		}
	}
	return false
}

func childCommand(fixturePath, mode string) *exec.Cmd {
	cmd := exec.Command(os.Args[0], "-test.run=^TestBitcoinWalkCompleteHubNativeInterruption$", "-test.timeout=6m", "-test.v")
	cmd.Env = append(os.Environ(), "BW_HUB_CHILD_MODE="+mode, "BW_HUB_FIXTURE="+fixturePath)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd
}

func runChild(t *testing.T, fixturePath, mode string, mustSucceed bool) {
	t.Helper()
	err := childCommand(fixturePath, mode).Run()
	if mustSucceed {
		require.NoError(t, err)
	}
}

func freePort(t *testing.T) string {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	port := strconv.Itoa(listener.Addr().(*net.TCPAddr).Port)
	require.NoError(t, listener.Close())
	return port
}

func parsePort(t *testing.T, address string) uint16 {
	t.Helper()
	_, portText, err := net.SplitHostPort(address)
	require.NoError(t, err)
	port, err := strconv.ParseUint(portText, 10, 16)
	require.NoError(t, err)
	return uint16(port)
}

func waitFor(t *testing.T, label string, timeout time.Duration, condition func() bool) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		time.Sleep(250 * time.Millisecond)
	}
	t.Fatal("timeout: " + label)
}

func waitChild(t *testing.T, label string, timeout time.Duration, condition func() bool) {
	t.Helper()
	waitFor(t, label, timeout, condition)
}

func newBitcoinRPC(port string) func(string, ...any) (json.RawMessage, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	return func(method string, params ...any) (json.RawMessage, error) {
		body, _ := json.Marshal(map[string]any{"jsonrpc": "1.0", "id": 1, "method": method, "params": params})
		req, _ := http.NewRequest("POST", "http://127.0.0.1:"+port, bytes.NewReader(body))
		req.SetBasicAuth("fixture", "regtest-only")
		response, err := client.Do(req)
		if err != nil {
			return nil, err
		}
		defer response.Body.Close()
		var decoded struct {
			Result json.RawMessage `json:"result"`
			Error  any             `json:"error"`
		}
		if err := json.NewDecoder(response.Body).Decode(&decoded); err != nil {
			return nil, err
		}
		if decoded.Error != nil {
			return nil, fmt.Errorf("regtest RPC %s: %v", method, decoded.Error)
		}
		return decoded.Result, nil
	}
}

func waitMempool(t *testing.T, rpc func(string, ...any) (json.RawMessage, error), count int) {
	t.Helper()
	waitFor(t, "funding transaction", 90*time.Second, func() bool {
		raw, err := rpc("getrawmempool")
		if err != nil {
			return false
		}
		var txs []string
		_ = json.Unmarshal(raw, &txs)
		return len(txs) >= count
	})
}

func writeJSON(t *testing.T, path string, value any) {
	t.Helper()
	require.NoError(t, os.MkdirAll(filepath.Dir(path), 0o700))
	data, err := json.MarshalIndent(value, "", "  ")
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(path, data, 0o600))
}

func readJSON(t *testing.T, path string, value any) {
	t.Helper()
	data, err := os.ReadFile(path)
	require.NoError(t, err)
	require.NoError(t, json.Unmarshal(data, value))
}

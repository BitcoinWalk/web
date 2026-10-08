package nip47

// Exercises a complete signed NIP-44 NWC request/response boundary with the
// real Hub event handler and transaction database. The LN backend is synthetic:
// no relay, wallet, network, credentials or funds are used.
import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/getAlby/go-nostr"
	"github.com/getAlby/hub/alby"
	"github.com/getAlby/hub/constants"
	"github.com/getAlby/hub/db"
	"github.com/getAlby/hub/db/queries"
	"github.com/getAlby/hub/lnclient"
	"github.com/getAlby/hub/nip47/cipher"
	"github.com/getAlby/hub/nip47/models"
	"github.com/getAlby/hub/tests"
	"github.com/stretchr/testify/require"
)

type bwEncryptedPayFixture struct {
	service    *tests.TestService
	app        *db.App
	permission *db.AppPermission
	cipher     *cipher.Nip47Cipher
	privateKey string
}

func newBwEncryptedPayFixture(t *testing.T) *bwEncryptedPayFixture {
	t.Helper()
	service, err := tests.CreateTestService(t)
	require.NoError(t, err)
	t.Cleanup(service.Remove)

	privateKey := nostr.GeneratePrivateKey()
	app, requestCipher, err := tests.CreateAppWithPrivateKey(service, privateKey, constants.ENCRYPTION_TYPE_NIP44_V2)
	require.NoError(t, err)
	permission := &db.AppPermission{
		AppId:        app.ID,
		Scope:        constants.PAY_INVOICE_SCOPE,
		MaxAmountSat: 200_000,
	}
	require.NoError(t, service.DB.Create(permission).Error)

	return &bwEncryptedPayFixture{
		service: service, app: app, permission: permission,
		cipher: requestCipher, privateKey: privateKey,
	}
}

func (fixture *bwEncryptedPayFixture) pay(t *testing.T) (*nostr.Event, models.Response) {
	t.Helper()
	payload, err := json.Marshal(map[string]interface{}{
		"method": models.PAY_INVOICE_METHOD,
		"params": map[string]interface{}{
			"invoice": tests.MockInvoice,
			"max_fee": uint64(100_000),
		},
	})
	require.NoError(t, err)
	encrypted, err := fixture.cipher.Encrypt(string(payload))
	require.NoError(t, err)
	pubkey, err := nostr.GetPublicKey(fixture.privateKey)
	require.NoError(t, err)
	request := &nostr.Event{
		Kind: models.REQUEST_KIND, PubKey: pubkey, CreatedAt: nostr.Now(),
		Tags:    nostr.Tags{[]string{"encryption", constants.ENCRYPTION_TYPE_NIP44_V2}},
		Content: encrypted,
	}
	require.NoError(t, request.Sign(fixture.privateKey))
	require.True(t, mustCheckBwSignature(t, request))

	pool := tests.NewMockSimplePool()
	oauth := alby.NewAlbyOAuthService(fixture.service.DB, fixture.service.Cfg, fixture.service.Keys, fixture.service.EventPublisher)
	NewNip47Service(fixture.service.DB, fixture.service.Cfg, fixture.service.Keys, fixture.service.EventPublisher, oauth).
		HandleEvent(context.Background(), pool, request, fixture.service.LNClient)
	require.Len(t, pool.PublishedEvents, 1)
	response := pool.PublishedEvents[0]
	require.Equal(t, models.RESPONSE_KIND, response.Kind)
	require.True(t, mustCheckBwSignature(t, response))
	require.Equal(t, request.ID, response.Tags.Find("e")[1])
	require.Equal(t, request.PubKey, response.Tags.Find("p")[1])
	decrypted, err := fixture.cipher.Decrypt(response.Content)
	require.NoError(t, err)
	var decoded models.Response
	require.NoError(t, json.Unmarshal([]byte(decrypted), &decoded))
	require.Equal(t, models.PAY_INVOICE_METHOD, decoded.ResultType)
	return response, decoded
}

func mustCheckBwSignature(t *testing.T, event *nostr.Event) bool {
	t.Helper()
	valid, err := event.CheckSignature()
	require.NoError(t, err)
	return valid
}

func TestBitcoinWalkEncryptedNwcPayInvoice(t *testing.T) {
	fixture := newBwEncryptedPayFixture(t)
	_, response := fixture.pay(t)
	require.Nil(t, response.Error)
	mock, ok := fixture.service.LNClient.(*tests.MockLn)
	require.True(t, ok)
	require.NotNil(t, mock.LastSendPaymentMaxFeeMsat)
	require.Equal(t, uint64(100_000), *mock.LastSendPaymentMaxFeeMsat)

	var transaction db.Transaction
	require.NoError(t, fixture.service.DB.Where("payment_hash = ? AND type = ?", tests.MockPaymentHash, constants.TRANSACTION_TYPE_OUTGOING).First(&transaction).Error)
	require.Equal(t, constants.TRANSACTION_STATE_SETTLED, transaction.State)
	require.Zero(t, transaction.FeeReserveMsat)
	usage, err := queries.GetBudgetUsageMsat(fixture.service.DB, fixture.permission)
	require.NoError(t, err)
	require.Equal(t, transaction.AmountMsat+transaction.FeeMsat, usage)
	t.Log("signed NIP-44 request reached the real pay controller with a 100-sat fee ceiling; signed response decrypted successfully")
}

func TestBitcoinWalkEncryptedNwcDefinitiveFailureReleasesBudget(t *testing.T) {
	fixture := newBwEncryptedPayFixture(t)
	mock := fixture.service.LNClient.(*tests.MockLn)
	mock.PayInvoiceResponses = []*lnclient.PayInvoiceResponse{nil}
	mock.PayInvoiceErrors = []error{errors.New("terminal route failure")}
	_, response := fixture.pay(t)
	require.NotNil(t, response.Error)
	require.NotEqual(t, "", response.Error.Code)

	var transaction db.Transaction
	require.NoError(t, fixture.service.DB.Where("payment_hash = ? AND type = ?", tests.MockPaymentHash, constants.TRANSACTION_TYPE_OUTGOING).First(&transaction).Error)
	require.Equal(t, constants.TRANSACTION_STATE_FAILED, transaction.State)
	require.Zero(t, transaction.FeeReserveMsat)
	usage, err := queries.GetBudgetUsageMsat(fixture.service.DB, fixture.permission)
	require.NoError(t, err)
	require.Zero(t, usage)
	t.Log("a proven terminal backend failure produced an encrypted NWC error and released principal plus fee reservation")
}

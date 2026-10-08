package nip47

// Opt-in acceptance through an external NWC relay using only fresh synthetic
// identities, temporary SQLite and Hub's in-memory mock LN backend. No NWC URI,
// live wallet, node credential, real invoice or funds are loaded.
import (
	"context"
	"encoding/json"
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/getAlby/go-nostr"
	"github.com/getAlby/hub/alby"
	"github.com/getAlby/hub/constants"
	"github.com/getAlby/hub/db"
	"github.com/getAlby/hub/nip47/models"
	"github.com/getAlby/hub/tests"
	"github.com/stretchr/testify/require"
)

func TestBitcoinWalkRealRelayNoFundsAcceptance(t *testing.T) {
	if os.Getenv("BW_NWC_RELAY_ACCEPTANCE") != "1" {
		t.Skip("explicit real-relay acceptance opt-in required")
	}
	relayURL := os.Getenv("BW_NWC_RELAY")
	require.Contains(t, []string{"wss://relay.getalby.com", "wss://relay2.getalby.com"}, relayURL, "only Hub's reviewed default NWC relays are allowed")
	require.NotZero(t, os.Getuid(), "non-root only")

	fixture := newBwEncryptedPayFixture(t)
	require.NoError(t, fixture.service.Cfg.SetUpdate("Relay", relayURL, ""))
	mock, ok := fixture.service.LNClient.(*tests.MockLn)
	require.True(t, ok, "acceptance must use the synthetic backend")
	poolContext, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	pool := nostr.NewSimplePool(poolContext)
	defer pool.Close("BitcoinWalk no-funds acceptance complete")

	payload, err := json.Marshal(map[string]interface{}{
		"method": models.PAY_INVOICE_METHOD,
		"params": map[string]interface{}{"invoice": tests.MockInvoice, "max_fee": uint64(100_000)},
	})
	require.NoError(t, err)
	encrypted, err := fixture.cipher.Encrypt(string(payload))
	require.NoError(t, err)
	clientPubkey, err := nostr.GetPublicKey(fixture.privateKey)
	require.NoError(t, err)
	now := nostr.Now()
	request := nostr.Event{Kind: models.REQUEST_KIND, PubKey: clientPubkey, CreatedAt: now,
		Tags:    nostr.Tags{[]string{"p", *fixture.app.WalletPubkey}, []string{"encryption", constants.ENCRYPTION_TYPE_NIP44_V2}, []string{"expiration", strconv.FormatInt(int64(now)+300, 10)}},
		Content: encrypted}
	require.NoError(t, request.Sign(fixture.privateKey))
	require.True(t, mustCheckBwSignature(t, &request))

	published := false
	for result := range pool.PublishMany(poolContext, []string{relayURL}, request) {
		require.NoError(t, result.Error)
		published = true
	}
	require.True(t, published)
	relayRequest := pool.QuerySingle(poolContext, []string{relayURL}, nostr.Filter{IDs: []string{request.ID}, Authors: []string{clientPubkey}, Kinds: []int{models.REQUEST_KIND}, Limit: 1})
	require.NotNil(t, relayRequest, "exact signed request was not read back")
	require.Equal(t, request.ID, relayRequest.ID)

	oauth := alby.NewAlbyOAuthService(fixture.service.DB, fixture.service.Cfg, fixture.service.Keys, fixture.service.EventPublisher)
	NewNip47Service(fixture.service.DB, fixture.service.Cfg, fixture.service.Keys, fixture.service.EventPublisher, oauth).
		HandleEvent(poolContext, pool, relayRequest.Event, fixture.service.LNClient)
	relayResponse := pool.QuerySingle(poolContext, []string{relayURL}, nostr.Filter{Kinds: []int{models.RESPONSE_KIND}, Authors: []string{*fixture.app.WalletPubkey}, Tags: nostr.TagMap{"e": []string{request.ID}}, Limit: 1})
	require.NotNil(t, relayResponse, "correlated signed response was not read back")
	require.True(t, mustCheckBwSignature(t, relayResponse.Event))
	decrypted, err := fixture.cipher.Decrypt(relayResponse.Content)
	require.NoError(t, err)
	var response models.Response
	require.NoError(t, json.Unmarshal([]byte(decrypted), &response))
	require.Nil(t, response.Error)
	require.Equal(t, models.PAY_INVOICE_METHOD, response.ResultType)
	require.NotNil(t, mock.LastSendPaymentMaxFeeMsat)
	require.Equal(t, uint64(100_000), *mock.LastSendPaymentMaxFeeMsat)
	var transaction db.Transaction
	require.NoError(t, fixture.service.DB.Where("payment_hash = ?", tests.MockPaymentHash).First(&transaction).Error)
	require.LessOrEqual(t, transaction.AmountMsat, uint64(50_000_000))
	t.Log("one synthetic encrypted NWC request and response completed through the selected real relay; mock backend only")
}

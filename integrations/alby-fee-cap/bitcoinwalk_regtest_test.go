package ldk

// Opt-in, private regtest only. Copy into the patched candidate's lnclient/ldk.
// No Hub config, saved token, external peer, faucet or real wallet is used.
import (
	"bytes"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	ldk "github.com/getAlby/ldk-node-go/ldk_node"
	"github.com/stretchr/testify/require"
)

func TestBitcoinWalkPrivateRegtest(t *testing.T) {
	bin := os.Getenv("BW_REGTEST_BITCOIND")
	if bin == "" {
		t.Skip("explicit regtest opt-in required")
	}
	require.NotZero(t, os.Getuid(), "non-root only")
	dir := t.TempDir()
	port := func() string {
		l, err := net.Listen("tcp", "127.0.0.1:0")
		require.NoError(t, err)
		p := fmt.Sprint(l.Addr().(*net.TCPAddr).Port)
		require.NoError(t, l.Close())
		return p
	}
	rpcPort := port()
	cmd := exec.Command(bin, "-regtest", "-datadir="+dir, "-server", "-listen=0", "-connect=0", "-dnsseed=0", "-discover=0", "-rpcbind=127.0.0.1", "-rpcallowip=127.0.0.1", "-rpcport="+rpcPort, "-rpcuser=fixture", "-rpcpassword=regtest-only", "-fallbackfee=0.0002", "-printtoconsole=0")
	require.NoError(t, cmd.Start())
	t.Cleanup(func() { _ = cmd.Process.Signal(os.Interrupt); _ = cmd.Wait() })
	client := &http.Client{Timeout: 10 * time.Second}
	rpc := func(method string, params ...any) (json.RawMessage, error) {
		body, _ := json.Marshal(map[string]any{"jsonrpc": "1.0", "id": 1, "method": method, "params": params})
		req, _ := http.NewRequest("POST", "http://127.0.0.1:"+rpcPort, bytes.NewReader(body))
		req.SetBasicAuth("fixture", "regtest-only")
		res, err := client.Do(req)
		if err != nil {
			return nil, err
		}
		defer res.Body.Close()
		var result struct {
			Result json.RawMessage
			Error  any
		}
		if err := json.NewDecoder(res.Body).Decode(&result); err != nil {
			return nil, err
		}
		if result.Error != nil {
			return nil, fmt.Errorf("regtest RPC %s: %v", method, result.Error)
		}
		return result.Result, nil
	}
	wait := func(label string, fn func() bool) {
		t.Helper()
		deadline := time.Now().Add(90 * time.Second)
		for time.Now().Before(deadline) {
			if fn() {
				return
			}
			time.Sleep(250 * time.Millisecond)
		}
		t.Fatal("timeout: " + label)
	}
	wait("private chain startup", func() bool { _, err := rpc("getblockchaininfo"); return err == nil })
	info, err := rpc("getblockchaininfo")
	require.NoError(t, err)
	var chain struct{ Chain string }
	require.NoError(t, json.Unmarshal(info, &chain))
	require.Equal(t, "regtest", chain.Chain)
	_, err = rpc("createwallet", "fixture")
	require.NoError(t, err)
	raw, err := rpc("getnewaddress")
	require.NoError(t, err)
	var mining string
	require.NoError(t, json.Unmarshal(raw, &mining))
	mine := func(n int) { _, err := rpc("generatetoaddress", n, mining); require.NoError(t, err) }
	mine(101)
	var nodes []*ldk.Node
	var addresses []string
	for i := 0; i < 3; i++ {
		b := ldk.NewBuilder()
		b.SetNetwork(ldk.NetworkRegtest)
		b.SetStorageDirPath(filepath.Join(dir, fmt.Sprintf("node-%d", i)))
		address := "127.0.0.1:" + port()
		require.NoError(t, b.SetListeningAddresses([]string{address}))
		require.NoError(t, b.SetAnnouncementAddresses([]string{address}))
		require.NoError(t, b.SetNodeAlias(fmt.Sprintf("regtest-%d", i)))
		addresses = append(addresses, address)
		var p uint16
		_, err := fmt.Sscan(rpcPort, &p)
		require.NoError(t, err)
		b.SetChainSourceBitcoindRpc("127.0.0.1", p, "fixture", "regtest-only")
		n, err := b.Build()
		require.NoError(t, err)
		require.NoError(t, n.Start())
		nodes = append(nodes, n)
		t.Cleanup(func() { _ = nodes[i].Stop() })
	}
	pump := func() {
		for _, n := range nodes {
			for ev := n.NextEvent(); ev != nil; ev = n.NextEvent() {
				if failed, ok := (*ev).(ldk.EventPaymentFailed); ok && failed.Reason != nil {
					t.Logf("regtest payment failure reason: %v", *failed.Reason)
				}
				require.NoError(t, n.EventHandled())
			}
		}
	}
	for _, n := range nodes[:2] {
		address, err := n.OnchainPayment().NewAddress()
		require.NoError(t, err)
		_, err = rpc("sendtoaddress", address, 1)
		require.NoError(t, err)
	}
	mine(6)
	for _, n := range nodes {
		require.NoError(t, n.SyncWallets())
	}
	for i := 0; i < 2; i++ {
		_, err := nodes[i].OpenAnnouncedChannel(nodes[i+1].NodeId(), addresses[i+1], 500000, nil, nil)
		require.NoError(t, err)
	}
	wait("funding transactions", func() bool {
		pump()
		raw, err := rpc("getrawmempool")
		if err != nil {
			return false
		}
		var txs []string
		_ = json.Unmarshal(raw, &txs)
		return len(txs) >= 2
	})
	mine(6)
	wait("usable channels", func() bool {
		pump()
		for _, n := range nodes {
			_ = n.SyncWallets()
			for _, ch := range n.ListChannels() {
				if !ch.IsUsable {
					return false
				}
			}
			if len(n.ListChannels()) == 0 {
				return false
			}
		}
		return true
	})
	t.Log("private three-node regtest route ready")
	setFee := func(fee uint32) {
		for _, ch := range nodes[1].ListChannels() {
			if ch.CounterpartyNodeId == nodes[2].NodeId() {
				cfg := ch.Config
				cfg.ForwardingFeeBaseMsat = fee
				cfg.ForwardingFeeProportionalMillionths = 0
				require.NoError(t, nodes[1].UpdateChannelConfig(ch.UserChannelId, ch.CounterpartyNodeId, cfg))
			}
		}
		wait("recipient fee hint update", func() bool {
			pump()
			for _, ch := range nodes[2].ListChannels() {
				if ch.CounterpartyForwardingInfoFeeBaseMsat != nil && *ch.CounterpartyForwardingInfoFeeBaseMsat == fee {
					return true
				}
			}
			return false
		})
	}
	var lastInvoice *ldk.Bolt11Invoice
	pay := func(cap uint64, success bool) string {
		invoice, err := nodes[2].Bolt11Payment().Receive(50_000_000, ldk.Bolt11InvoiceDescriptionDirect{Description: "isolated fee-cap fixture"}, 3600)
		require.NoError(t, err)
		lastInvoice = invoice
		limit := getMaxTotalRoutingFeeLimit(50_000_000, &cap)
		id, err := nodes[0].Bolt11Payment().Send(invoice, &ldk.RouteParametersConfig{MaxTotalRoutingFeeMsat: &limit, MaxTotalCltvExpiryDelta: 1008, MaxPathCount: 1})
		if err != nil {
			require.False(t, success, "positive control failed: %v", err)
			if received := nodes[2].Payment(invoice.PaymentHash()); received != nil {
				require.NotEqual(t, ldk.PaymentStatusSucceeded, received.Status)
			}
			return ""
		}
		wait("terminal payment result", func() bool {
			pump()
			p := nodes[0].Payment(id)
			return p != nil && p.Status != ldk.PaymentStatusPending
		})
		p := nodes[0].Payment(id)
		if success {
			require.Equal(t, ldk.PaymentStatusSucceeded, p.Status)
			require.NotNil(t, p.FeePaidMsat)
			require.LessOrEqual(t, *p.FeePaidMsat, cap)
			require.Equal(t, uint64(50_000_000), *p.AmountMsat)
		} else {
			require.Equal(t, ldk.PaymentStatusFailed, p.Status)
		}
		return id
	}
	setFee(101_000)
	pay(100_000, false)
	t.Log("101-sat route rejected with 100-sat cap")
	id := pay(101_000, true)
	require.Equal(t, uint64(101_000), *nodes[0].Payment(id).FeePaidMsat)
	t.Log("positive control: same route succeeds with explicit 101-sat TEST-ONLY cap")
	setFee(100_000)
	pay(99_999, false)
	t.Log("100-sat route rejected when cap is one millisatoshi lower")
	id = pay(100_000, true)
	require.Equal(t, uint64(100_000), *nodes[0].Payment(id).FeePaidMsat)
	t.Log("50,000-sat regtest payment succeeds at exact 100-sat fee boundary")
	require.NoError(t, nodes[0].Stop())
	nodes[0].Destroy()
	b := ldk.NewBuilder()
	b.SetNetwork(ldk.NetworkRegtest)
	b.SetStorageDirPath(filepath.Join(dir, "node-0"))
	require.NoError(t, b.SetListeningAddresses([]string{addresses[0]}))
	require.NoError(t, b.SetAnnouncementAddresses([]string{addresses[0]}))
	require.NoError(t, b.SetNodeAlias("regtest-0"))
	var pnum uint16
	_, err = fmt.Sscan(rpcPort, &pnum)
	require.NoError(t, err)
	b.SetChainSourceBitcoindRpc("127.0.0.1", pnum, "fixture", "regtest-only")
	nodes[0], err = b.Build()
	require.NoError(t, err)
	require.NoError(t, nodes[0].Start())
	p := nodes[0].Payment(id)
	require.NotNil(t, p)
	require.Equal(t, ldk.PaymentStatusSucceeded, p.Status)
	require.NotNil(t, p.AmountMsat)
	require.Equal(t, uint64(50_000_000), *p.AmountMsat)
	require.NotNil(t, p.FeePaidMsat)
	require.Equal(t, uint64(100_000), *p.FeePaidMsat)
	cap := uint64(100_000)
	_, err = nodes[0].Bolt11Payment().Send(lastInvoice, &ldk.RouteParametersConfig{MaxTotalRoutingFeeMsat: &cap, MaxTotalCltvExpiryDelta: 1008, MaxPathCount: 1})
	require.Error(t, err, "settled invoice must not be paid twice after reconstruction")
	require.ErrorContains(t, err, "DuplicatePayment")
	t.Log("settled amount and fee reload from disk; duplicate payment rejected after fresh node reconstruction")
}

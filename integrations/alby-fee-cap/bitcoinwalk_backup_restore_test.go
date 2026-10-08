package transactions

// Synthetic, authenticated backup rehearsal for the patched candidate. It
// never opens a real Hub workdir, wallet, channel backup or credential.
import (
	"archive/tar"
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/getAlby/hub/constants"
	hubdb "github.com/getAlby/hub/db"
	"github.com/getAlby/hub/tests"
	"github.com/stretchr/testify/require"
)

func TestBitcoinWalkEncryptedBackupRestoreRollback(t *testing.T) {
	require.NotZero(t, os.Getuid(), "non-root only")
	root := t.TempDir()
	source := filepath.Join(root, "synthetic-hub")
	require.NoError(t, os.MkdirAll(filepath.Join(source, "ldk"), 0o700))
	require.NoError(t, os.WriteFile(filepath.Join(source, "ldk", "static-channel-backup.fixture"), []byte("synthetic-channel-backup-marker"), 0o600))
	database := filepath.Join(source, "hub.sqlite")
	t.Setenv("TEST_DATABASE_URI", database)
	svc, err := tests.CreateTestService(t)
	require.NoError(t, err)
	app, _, err := tests.CreateApp(svc)
	require.NoError(t, err)
	other, _, err := tests.CreateApp(svc)
	require.NoError(t, err)
	cutoff := time.Now().UTC().Add(-time.Hour)
	first := createLegacyFailedFixture(t, svc, app.ID, "backup-legacy-one", 50_000_000, cutoff.Add(-time.Hour))
	second := createLegacyFailedFixture(t, svc, app.ID, "backup-legacy-two", 25_000_000, cutoff.Add(-time.Minute))
	createLegacyFailedFixture(t, svc, other.ID, "backup-other-app", 10_000_000, cutoff.Add(-time.Minute))
	svc.Remove()

	key := make([]byte, 32)
	_, err = rand.Read(key)
	require.NoError(t, err)
	original := encryptedDirectory(t, source, key, "bitcoinwalk:hub-candidate:v1")
	require.NotContains(t, string(original), "backup-legacy-one")
	require.NotContains(t, string(original), "synthetic-channel-backup-marker")
	wrong := append([]byte(nil), key...)
	wrong[0] ^= 1
	require.Error(t, restoreDirectory(root, "wrong-key", original, wrong, "bitcoinwalk:hub-candidate:v1"))
	damaged := append([]byte(nil), original...)
	damaged[len(damaged)-1] ^= 1
	require.Error(t, restoreDirectory(root, "damaged", damaged, key, "bitcoinwalk:hub-candidate:v1"))

	restored := restoreDirectoryOK(t, root, "restored", original, key, "bitcoinwalk:hub-candidate:v1")
	marker, err := os.ReadFile(filepath.Join(restored, "ldk", "static-channel-backup.fixture"))
	require.NoError(t, err)
	require.Equal(t, "synthetic-channel-backup-marker", string(marker))
	db, err := hubdb.NewDB(filepath.Join(restored, "hub.sqlite"), false)
	require.NoError(t, err)
	audit, err := AuditLegacyFailedOutgoingPayments(db, app.ID, cutoff, 100_000)
	require.NoError(t, err)
	require.Equal(t, []uint{first.ID, second.ID}, audit.TransactionIDs)
	_, err = QuarantineLegacyFailedOutgoingPayments(db, app.ID, cutoff, 100_000, audit.Fingerprint)
	require.NoError(t, err)
	require.NoError(t, hubdb.Stop(db))

	migrated := encryptedDirectory(t, restored, key, "bitcoinwalk:hub-candidate:v1")
	migratedRestore := restoreDirectoryOK(t, root, "migrated", migrated, key, "bitcoinwalk:hub-candidate:v1")
	db, err = hubdb.NewDB(filepath.Join(migratedRestore, "hub.sqlite"), false)
	require.NoError(t, err)
	repeated, err := QuarantineLegacyFailedOutgoingPayments(db, app.ID, cutoff, 100_000, audit.Fingerprint)
	require.NoError(t, err)
	require.Equal(t, 2, repeated.Count)
	var pending int64
	require.NoError(t, db.Model(&hubdb.Transaction{}).Where("id IN ? AND state = ? AND fee_reserve_msat = ?", []uint{first.ID, second.ID}, constants.TRANSACTION_STATE_PENDING, 100_000).Count(&pending).Error)
	require.Equal(t, int64(2), pending)
	require.NoError(t, hubdb.Stop(db))

	rollback := restoreDirectoryOK(t, root, "rollback", original, key, "bitcoinwalk:hub-candidate:v1")
	db, err = hubdb.NewDB(filepath.Join(rollback, "hub.sqlite"), false)
	require.NoError(t, err)
	var failed int64
	require.NoError(t, db.Model(&hubdb.Transaction{}).Where("id IN ? AND state = ? AND fee_reserve_msat = 0", []uint{first.ID, second.ID}, constants.TRANSACTION_STATE_FAILED).Count(&failed).Error)
	require.Equal(t, int64(2), failed)
	require.NoError(t, hubdb.Stop(db))
}

func encryptedDirectory(t *testing.T, directory string, key []byte, context string) []byte {
	t.Helper()
	var plain bytes.Buffer
	tw := tar.NewWriter(&plain)
	require.NoError(t, filepath.Walk(directory, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		name, err := filepath.Rel(directory, path)
		if err != nil || name == "." {
			return err
		}
		header, err := tar.FileInfoHeader(info, "")
		if err != nil {
			return err
		}
		header.Name = filepath.ToSlash(name)
		if err = tw.WriteHeader(header); err != nil || info.IsDir() {
			return err
		}
		file, err := os.Open(path)
		if err != nil {
			return err
		}
		defer file.Close()
		_, err = io.Copy(tw, file)
		return err
	}))
	require.NoError(t, tw.Close())
	block, err := aes.NewCipher(key)
	require.NoError(t, err)
	gcm, err := cipher.NewGCM(block)
	require.NoError(t, err)
	nonce := make([]byte, gcm.NonceSize())
	_, err = rand.Read(nonce)
	require.NoError(t, err)
	return append(nonce, gcm.Seal(nil, nonce, plain.Bytes(), []byte(context))...)
}

func restoreDirectory(root, name string, encrypted, key []byte, context string) error {
	block, err := aes.NewCipher(key)
	if err != nil {
		return err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return err
	}
	if len(encrypted) < gcm.NonceSize() {
		return io.ErrUnexpectedEOF
	}
	plain, err := gcm.Open(nil, encrypted[:gcm.NonceSize()], encrypted[gcm.NonceSize():], []byte(context))
	if err != nil {
		return err
	}
	destination := filepath.Join(root, name)
	if err = os.Mkdir(destination, 0o700); err != nil {
		return err
	}
	tr := tar.NewReader(bytes.NewReader(plain))
	for {
		header, next := tr.Next()
		if next == io.EOF {
			break
		}
		if next != nil {
			return next
		}
		clean := filepath.Clean(header.Name)
		if clean == "." || filepath.IsAbs(clean) || clean == ".." || len(clean) > 3 && clean[:3] == "../" {
			return io.ErrUnexpectedEOF
		}
		path := filepath.Join(destination, clean)
		if header.FileInfo().IsDir() {
			if err = os.MkdirAll(path, 0o700); err != nil {
				return err
			}
			continue
		}
		if err = os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
			return err
		}
		file, createErr := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
		if createErr != nil {
			return createErr
		}
		_, copyErr := io.Copy(file, tr)
		closeErr := file.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
	}
	return nil
}

func restoreDirectoryOK(t *testing.T, root, name string, encrypted, key []byte, context string) string {
	t.Helper()
	require.NoError(t, restoreDirectory(root, name, encrypted, key, context))
	return filepath.Join(root, name)
}

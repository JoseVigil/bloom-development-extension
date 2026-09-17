package gene

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

func ResolveAssets(projectID string, assets []AssetRef, repositories map[string]string) ([]AssetRef, error) {
	out := make([]AssetRef, len(assets))
	for i, asset := range assets {
		if asset.ProjectID != projectID {
			return nil, ErrProjectMismatch
		}
		if asset.RepositoryID == "" {
			return nil, ErrRepositoryIDRequired
		}
		root, ok := repositories[asset.RepositoryID]
		if !ok || root == "" {
			return nil, ErrRepositoryUnresolved
		}
		if asset.Kind != "file" && asset.Kind != "document" && asset.Kind != "test" {
			return nil, ErrVerificationFailed
		}
		clean, err := portableRelativePath(asset.RepositoryRelativePath)
		if err != nil {
			return nil, err
		}
		rootAbs, err := filepath.Abs(root)
		if err != nil {
			return nil, err
		}
		rootInfo, err := os.Lstat(rootAbs)
		if err != nil || !rootInfo.IsDir() || rootInfo.Mode()&os.ModeSymlink != 0 {
			return nil, ErrRepositoryUnresolved
		}
		candidate := filepath.Join(rootAbs, filepath.FromSlash(clean))
		cursor := rootAbs
		for _, component := range strings.Split(clean, "/") {
			cursor = filepath.Join(cursor, component)
			partInfo, partErr := os.Lstat(cursor)
			if errors.Is(partErr, os.ErrNotExist) {
				return nil, ErrAssetMissing
			}
			if partErr != nil {
				return nil, partErr
			}
			if partInfo.Mode()&os.ModeSymlink != 0 {
				return nil, ErrAssetOutsideRepository
			}
		}
		info, err := os.Lstat(candidate)
		if errors.Is(err, os.ErrNotExist) {
			return nil, ErrAssetMissing
		}
		if err != nil {
			return nil, err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return nil, ErrAssetOutsideRepository
		}
		rel, err := filepath.Rel(rootAbs, candidate)
		if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			return nil, ErrAssetOutsideRepository
		}
		if info.IsDir() {
			return nil, ErrAssetPathInvalid
		}
		f, err := os.Open(candidate)
		if err != nil {
			return nil, err
		}
		h := sha256.New()
		n, copyErr := io.Copy(h, f)
		closeErr := f.Close()
		if copyErr != nil {
			return nil, copyErr
		}
		if closeErr != nil {
			return nil, closeErr
		}
		observed := "sha256:" + hex.EncodeToString(h.Sum(nil))
		if asset.Observed.SHA256 != "" && asset.Observed.SHA256 != observed {
			return nil, ErrAssetDigestChanged
		}
		asset.RepositoryRelativePath = clean
		asset.Observed = ObservedAsset{SHA256: observed, SizeBytes: n}
		assetIDPayload := struct {
			ProjectID    string `json:"project_id"`
			RepositoryID string `json:"repository_id"`
			Path         string `json:"repository_relative_path"`
		}{projectID, asset.RepositoryID, clean}
		assetID, _, err := digestValue(assetIDPayload)
		if err != nil {
			return nil, err
		}
		if asset.AssetID != "" && asset.AssetID != assetID {
			return nil, fmt.Errorf("%w: asset_id", ErrVerificationFailed)
		}
		asset.AssetID = assetID
		out[i] = asset
	}
	return out, nil
}

func portableRelativePath(path string) (string, error) {
	if path == "" || strings.Contains(path, "\\") || filepath.IsAbs(path) || filepath.VolumeName(path) != "" {
		return "", ErrAssetPathInvalid
	}
	clean := filepath.ToSlash(filepath.Clean(filepath.FromSlash(path)))
	if clean == "." || clean == ".." || strings.HasPrefix(clean, "../") || clean != path {
		return "", ErrAssetPathInvalid
	}
	for _, part := range strings.Split(clean, "/") {
		if part == "" || part == "." || part == ".." {
			return "", ErrAssetPathInvalid
		}
	}
	return clean, nil
}

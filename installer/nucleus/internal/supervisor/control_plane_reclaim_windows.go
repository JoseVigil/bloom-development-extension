//go:build windows

package supervisor

// reclaimControlPlanePort is a no-op on Windows: the orphaned Control Plane
// there is reclaimed by Metamorph's stopOwnedNucleusProcesses
// (installer/metamorph/internal/maintenance/rollout_windows.go), which has
// the image-path/ancestry ownership checks that platform needs.
func reclaimControlPlanePort(nodePath, bundleScript string) error {
	return nil
}

// internal/core/org_context.go
package core

import (
	"fmt"
	"os"
	"path/filepath"
)

// ResolveNucleusRoot devuelve la ruta absoluta a la carpeta de datos de la
// organización activa: ~/.bloom/.nucleus-{org}/
//
// FIX (auditoría multi-org): vault.go, blueprint.go, ownership.go y
// alfred.go resolvían esta ruta cada uno por su cuenta, hardcodeada como
// ~/.bloom/.nucleus/ — SIN sufijo de org. create.go nunca escribe ahí:
// delega en `brain nucleus create --org <slug>`, que produce
// ~/.bloom/.nucleus-{slug}/. Resultado real: con cualquier --org != "",
// vault/blueprint/ownership/alfred leen y escriben en una carpeta que
// create.go jamás generó — silenciosamente tratada como "no existe todavía"
// en vez de "es la org equivocada".
//
// Este es ahora el ÚNICO lugar que arma este path. Ningún otro archivo debe
// volver a hacer filepath.Join(homeDir, ".bloom", ".nucleus...") a mano.
func ResolveNucleusRoot(orgSlug string) (string, error) {
	// 1. Override explícito — alfred.go ya usaba esta env var de forma
	//    aislada; se generaliza acá para que todos los módulos la respeten
	//    por igual (útil también para tests/simulation_env).
	if root := os.Getenv("BLOOM_NUCLEUS_ROOT"); root != "" {
		return root, nil
	}

	// 2. Org explícita pasada por el caller (ej. un futuro flag --org en
	//    los comandos vault/alfred). Si no vino nada, caemos a la env var
	//    que un proceso padre (Conductor, o el propio shell) puede haber
	//    seteado para indicar "esta es la org activa ahora mismo" — el
	//    mismo modelo stateless-por-invocación que ya usa el resto del CLI.
	if orgSlug == "" {
		orgSlug = os.Getenv("BLOOM_ORG")
	}

	if orgSlug == "" {
		return "", fmt.Errorf(
			"no active organization: set BLOOM_ORG, pass --org, or run 'nucleus create' first",
		)
	}

	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}

	return filepath.Join(homeDir, ".bloom", fmt.Sprintf(".nucleus-%s", orgSlug)), nil
}

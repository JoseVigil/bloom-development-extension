package authority

import (
	"context"
	"crypto/ed25519"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// FetchOrganizationTenantID resuelve el tenantId de la organización autenticada vía
// GET /v1/authority/tenant/self (S2S) — fix companion, Sovereign Tenant Fase 5, tras
// hallazgo de cowork BACKEND al desplegar el endpoint
// (Cierre_Implementacion_Endpoint_TenantSelf_v1_0.md, 2026-09-16): la ruta exige
// verifyInstallationAuth (firma Ed25519 de instalación + ?org= explícito) — el mismo
// mecanismo que ya usa SyncClient para trust-manifest y sync/pull — no el token
// estático de servicio, que Backend ya no acepta para rutas posteriores al registro
// de instalación (identity.ts: "snapshot/trust-bundle ya NO aceptan este token una
// vez que la instalación tiene clave registrada" — esta ruta se llama siempre en el
// mismo "sync" que ya invoca trust-manifest, es decir, siempre después de ese
// registro). El intento anterior (en el paquete governance) mandaba sólo un Bearer
// estático sin ?org= ni firma y nunca podía autenticar contra este endpoint. Esta
// función vive acá, en authority, porque necesita el signedRequest privado de
// SyncClient — governance no tiene ni debería tener acceso a eso.
//
// tenantId puede volver null en una respuesta 200 válida (organización sin
// tenant conocido todavía) — no es un error: se propaga como (nil, nil), igual que
// el resto de este mecanismo trata un tenant ausente en cualquier otro punto
// (ownership_reconciliation.go, paquete governance).
func FetchOrganizationTenantID(ctx context.Context, baseURL, path string, binding Binding, privateKey ed25519.PrivateKey, httpClient *http.Client, now time.Time) (*string, error) {
	if baseURL == "" || path == "" || binding.OrganizationID == "" || binding.InstallationID == "" || len(privateKey) != ed25519.PrivateKeySize {
		return nil, errors.New("authority: tenant lookup requires base URL, path, installation binding and installation key")
	}
	client := &SyncClient{BaseURL: baseURL, Binding: binding, InstallationPrivateKey: privateKey, HTTP: httpClient, Now: func() time.Time { return now }}
	req, err := client.signedRequest(ctx, http.MethodGet, path, url.Values{"org": {binding.OrganizationID}})
	if err != nil {
		return nil, err
	}
	response, err := client.client().Do(req)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("tenant lookup HTTP %d", response.StatusCode)
	}
	var body struct {
		TenantID *string `json:"tenantId"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&body); err != nil {
		return nil, fmt.Errorf("authority: invalid tenant lookup response: %w", err)
	}
	if body.TenantID != nil && *body.TenantID == "" {
		return nil, errors.New("authority: tenant lookup response has empty tenant_id")
	}
	return body.TenantID, nil
}

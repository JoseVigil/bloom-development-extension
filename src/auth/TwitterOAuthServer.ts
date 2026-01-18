import * as http from 'http';
import * as crypto from 'crypto';
import { BrainApiAdapter } from '../api/adapters/BrainApiAdapter';
// Importa 'open' o usa shell de electron para abrir la URL ya que profile launch no funciona
import * as vscode from 'vscode';

export class TwitterOAuthServer {
  private server: http.Server | null = null;
  private codeVerifier: string = '';

  private getOAuthConfig() {
    return {
      clientId: 'TU_CLIENT_ID_DE_X', // Debería venir de config
      callback: 'http://localhost:48215/api/v1/auth/twitter/callback'
    };
  }

  async startFlow() {
    this.codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(this.codeVerifier).digest('base64url');
    
    const config = this.getOAuthConfig();
    const url = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${config.clientId}&redirect_uri=${encodeURIComponent(config.callback)}&scope=tweet.read%20users.read%20offline.access&state=state&code_challenge=${codeChallenge}&code_challenge_method=S256`;
    
    await vscode.env.openExternal(vscode.Uri.parse(url));
  }
  
  // Lógica de intercambio de token similar a GitHub...
}
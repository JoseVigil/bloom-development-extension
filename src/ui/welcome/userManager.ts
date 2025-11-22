import * as vscode from 'vscode';

export class UserManager {
    private static instance: UserManager;
    private context: vscode.ExtensionContext;

    private constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    static init(context: vscode.ExtensionContext): UserManager {
        if (!this.instance) {
            this.instance = new UserManager(context);
        }
        return this.instance;
    }

    isRegistered(): boolean {
        return !!this.context.globalState.get<string>('bloom.user.email');
    }

    getUser() {
        return {
            email: this.context.globalState.get<string>('bloom.user.email'),
            name: this.context.globalState.get<string>('bloom.user.name'),
            registeredAt: this.context.globalState.get<string>('bloom.user.registeredAt'),
            acceptedTerms: this.context.globalState.get<boolean>('bloom.user.acceptedTerms')
        };
    }

    async register(email: string, name: string): Promise<void> {
        await this.context.globalState.update('bloom.user.email', email.trim().toLowerCase());
        await this.context.globalState.update('bloom.user.name', name.trim());
        await this.context.globalState.update('bloom.user.registeredAt', new Date().toISOString());
        await this.context.globalState.update('bloom.user.acceptedTerms', true);
        
        // Evento futuro: enviar a tu backend si querés
        vscode.commands.executeCommand('setContext', 'bloom.isRegistered', true);
    }
}
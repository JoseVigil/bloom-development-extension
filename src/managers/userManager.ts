// src/managers/userManager.ts
import * as vscode from 'vscode';

export class UserManager {
    private static instance: UserManager;
    private context!: vscode.ExtensionContext;

    private constructor() {
        // Singleton: constructor privado
    }

    public static init(context: vscode.ExtensionContext): UserManager {
        if (!UserManager.instance) {
            UserManager.instance = new UserManager();
            UserManager.instance.context = context;
        }
        return UserManager.instance;
    }

    public isRegistered(): boolean {
        const email = this.context.globalState.get<string>('bloom.user.email');
        const accepted = this.context.globalState.get<boolean>('bloom.user.acceptedTerms');
        return !!email && accepted === true;
    }

    public getUser(): {
        name: string;
        email: string;
        registeredAt: string;
    } | null {
        const email = this.context.globalState.get<string>('bloom.user.email');
        if (!email) return null;

        return {
            name: this.context.globalState.get<string>('bloom.user.name') || '',
            email,
            registeredAt: this.context.globalState.get<string>('bloom.user.registeredAt') || ''
        };
    }

    public async register(name: string, email: string): Promise<void> {
        const now = new Date().toISOString();

        await Promise.all([
            this.context.globalState.update('bloom.user.name', name.trim()),
            this.context.globalState.update('bloom.user.email', email.trim().toLowerCase()),
            this.context.globalState.update('bloom.user.registeredAt', now),
            this.context.globalState.update('bloom.user.acceptedTerms', true)
        ]);

        await vscode.commands.executeCommand('setContext', 'bloom.isRegistered', true);
    }

    public async clear(): Promise<void> {
        await Promise.all([
            this.context.globalState.update('bloom.user.email', undefined),
            this.context.globalState.update('bloom.user.name', undefined),
            this.context.globalState.update('bloom.user.registeredAt', undefined),
            this.context.globalState.update('bloom.user.acceptedTerms', undefined)
        ]);
        await vscode.commands.executeCommand('setContext', 'bloom.isRegistered', false);
    }
}
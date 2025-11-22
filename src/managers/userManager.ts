// src/managers/userManager.ts
import * as vscode from 'vscode';

export interface BloomUser {
    githubUsername: string;
    githubOrg: string;
    registeredAt: number;
}

export class UserManager {
    private static instance: UserManager;
    private context: vscode.ExtensionContext;

    private constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    static init(context: vscode.ExtensionContext): UserManager {
        if (!UserManager.instance) {
            UserManager.instance = new UserManager(context);
        }
        return UserManager.instance;
    }

    getUser(): BloomUser | null {
        // ←←← ESTA ES LA LÍNEA CORREGIDA
        const user = this.context.globalState.get<BloomUser>('bloom.user.v2');
        return user ?? null;
    }

    async saveUser(user: {
        githubUsername: string;
        githubOrg?: string;
    }): Promise<void> {
        const finalUser: BloomUser = {
            githubUsername: user.githubUsername.trim().replace('@', ''),
            githubOrg: (user.githubOrg?.trim() || user.githubUsername.trim().replace('@', '')),
            registeredAt: Date.now()
        };

        await this.context.globalState.update('bloom.user.v2', finalUser);
        await vscode.commands.executeCommand('setContext', 'bloom.isRegistered', true);
    }

    isRegistered(): boolean {
        const user = this.getUser();
        return !!user?.githubUsername && !!user?.githubOrg;
    }

    async clear(): Promise<void> {
        await this.context.globalState.update('bloom.user.v2', undefined);
        await vscode.commands.executeCommand('setContext', 'bloom.isRegistered', false);
    }
}
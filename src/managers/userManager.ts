// src/managers/userManager.ts
import * as vscode from 'vscode';

export interface BloomUser {
    githubUsername: string;
    githubOrg: string;          
    allOrgs: string[];         
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
        const user = this.context.globalState.get<BloomUser>('bloom.user.v3');
        return user ?? null;
    }

    async saveUser(data: {
        githubUsername: string;
        githubOrg?: string;
        allOrgs?: string[];
    }): Promise<void> {
        const finalUser: BloomUser = {
            githubUsername: data.githubUsername.trim().replace('@', ''),
            githubOrg: (data.githubOrg?.trim() || data.githubUsername.trim().replace('@', '')),
            allOrgs: data.allOrgs || [data.githubUsername.trim().replace('@', '')],
            registeredAt: Date.now()
        };

        await this.context.globalState.update('bloom.user.v3', finalUser);
        await vscode.commands.executeCommand('setContext', 'bloom.isRegistered', true);
    }

    isRegistered(): boolean {
        const user = this.getUser();
        return !!user?.githubUsername && !!user?.allOrgs?.length;
    }

    async clear(): Promise<void> {
        await this.context.globalState.update('bloom.user.v3', undefined);
        await vscode.commands.executeCommand('setContext', 'bloom.isRegistered', false);
    }

    static async getUserData(): Promise<any> {
        const context = this.instance?.context;
        if (!context) return null;
        return context.globalState.get('bloom.user', null);
    }
}
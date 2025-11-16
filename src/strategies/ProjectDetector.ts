import { ICodebaseStrategy } from '../models/codebaseStrategy';
import { AndroidStrategy } from './AndroidStrategy';
import { GenericStrategy } from './GenericStrategy';

export class ProjectDetector {
    private strategies: ICodebaseStrategy[] = [];
    
    constructor() {
        this.registerStrategies();
    }
    
    private registerStrategies(): void {
        this.strategies = [
            new AndroidStrategy(),
            new GenericStrategy()
        ];
    }
    
    async detectStrategy(workspaceRoot: string): Promise<ICodebaseStrategy | null> {
        for (const strategy of this.strategies) {
            const detected = await strategy.detect(workspaceRoot);
            if (detected) {
                return strategy;
            }
        }
        return null;
    }
}
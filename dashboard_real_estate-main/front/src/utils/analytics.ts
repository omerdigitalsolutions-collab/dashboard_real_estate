import { Deal } from '../types';

export interface PipelineStats {
    totalValue: number;
    revenue: number;
    successRate: number; // 0 to 100
    wonCount: number;
    lostCount: number;
    activeCount: number;
}

export function calculatePipelineStats(deals: Deal[]): PipelineStats {
    let totalValue = 0;
    let revenue = 0;
    let wonCount = 0;
    let lostCount = 0;
    let activeCount = 0;

    for (const deal of deals) {
        if (deal.stage === 'won') {
            wonCount++;
            revenue += (deal.actualCommission ?? 0);
        } else if (deal.stage === 'lost') {
            lostCount++;
        } else {
            // Active stages
            activeCount++;
            totalValue += (deal.projectedCommission ?? 0);
        }
    }

    const totalResolved = wonCount + lostCount;
    const successRate = totalResolved > 0 ? (wonCount / totalResolved) * 100 : 0;

    return {
        totalValue,
        revenue,
        successRate,
        wonCount,
        lostCount,
        activeCount
    };
}

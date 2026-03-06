import { Deal, Lead } from '../types';

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
        const stageNorm = ((deal.stage as string) || '').toLowerCase();
        if (stageNorm === 'won') {
            wonCount++;
            // Use actual commission if set, otherwise fall back to projected
            revenue += ((deal as any).actualCommission || deal.projectedCommission || 0);
        } else if (stageNorm === 'lost') {
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

export const LEAD_STATUS_HEBREW: Record<string, string> = {
    'new': 'חדש',
    'contacted': 'נוצר קשר',
    'meeting_set': 'נקבעה פגישה',
    'lost': 'לא רלוונטי',
    'won': 'נסגר בהצלחה'
};

export function aggregateLeadSources(leads: Lead[]) {
    const counts: Record<string, number> = {};
    leads.forEach(lead => {
        const source = lead.source || 'Other';
        counts[source] = (counts[source] || 0) + 1;
    });
    return Object.entries(counts)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
}

export function aggregateLeadStatuses(leads: Lead[]) {
    const counts: Record<string, number> = {};
    leads.forEach(lead => {
        const status = lead.status || 'new';
        counts[status] = (counts[status] || 0) + 1;
    });
    return Object.entries(counts)
        .map(([rawStatus, value]) => ({
            name: LEAD_STATUS_HEBREW[rawStatus] || rawStatus,
            value
        }))
        .sort((a, b) => b.value - a.value);
}

export function aggregateDealStages(deals: Deal[], customStages: { id: string; label: string }[] = []) {
    const counts: Record<string, number> = {};

    const stageMap = customStages.reduce((acc, stage) => {
        acc[stage.id] = stage.label;
        return acc;
    }, {} as Record<string, string>);

    stageMap['won'] = 'נסגר בהצלחה';
    stageMap['lost'] = 'לא רלוונטי';

    deals.forEach(deal => {
        const stage = deal.stage || 'new';
        counts[stage] = (counts[stage] || 0) + 1;
    });

    return Object.entries(counts)
        .map(([id, value]) => ({
            name: stageMap[id] || id,
            value
        }))
        .sort((a, b) => b.value - a.value);
}

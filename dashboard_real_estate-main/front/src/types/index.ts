import { Timestamp } from 'firebase/firestore';

// ─── Agencies ────────────────────────────────────────────────────────────────
export type AgencySpecialization = 'residential' | 'commercial' | 'luxury' | 'new_projects';

export interface Agency {
    id: string;
    name: string;
    // Extended professional profile (set during onboarding)
    agencyName?: string;
    slogan?: string;
    officePhone?: string;
    licenseNumber?: string;
    mainServiceArea?: string;
    specialization?: AgencySpecialization;
    subscriptionTier: 'free' | 'pro' | 'enterprise';
    monthlyGoals: {
        commissions: number;
        deals: number;
        leads: number;
    };
    yearlyGoals?: {
        commissions: number;
        deals: number;
        leads: number;
    };
    settings: {
        logoUrl?: string;
        themeColor?: string;
    };
    createdAt: Timestamp;
}

// ─── Users ────────────────────────────────────────────────────────────────────
export type UserRole = 'admin' | 'agent';

export interface AppUser {
    id: string;          // Firestore document ID (stub docId — NOT always the Firebase UID)
    uid: string | null;  // Firebase Auth UID — null for stubs not yet linked
    agencyId: string;
    name: string;
    role: UserRole;
    email: string;
    phone?: string;
    photoURL?: string;   // Profile picture URL
    isActive?: boolean;  // false = suspended; defaults to true
    goals?: {
        monthly: {
            revenue: number;
            deals: number;
        };
        yearly: {
            revenue: number;
            deals: number;
        };
    };
    createdAt?: Timestamp;
}

// ─── Leads ────────────────────────────────────────────────────────────────────
export type LeadStatus = 'new' | 'contacted' | 'meeting_set' | 'lost' | 'won';

export interface Lead {
    id: string;
    agencyId: string;
    type?: 'buyer' | 'seller';
    name: string;
    phone: string;
    email?: string | null;
    source: string;
    assignedAgentId: string | null;
    status: LeadStatus;
    requirements: {
        desiredCity: string[];
        maxBudget: number | null;
        minRooms: number | null;
        maxRooms: number | null;
        minSizeSqf: number | null;
        floorMin: number | null;
        floorMax: number | null;
        propertyType: string[];
        mustHaveElevator: boolean;
        mustHaveParking: boolean;
        mustHaveBalcony: boolean;
        mustHaveSafeRoom: boolean;
        condition: 'new' | 'renovated' | 'needs_renovation' | 'any';
        urgency: 'immediate' | '1-3_months' | '3-6_months' | 'flexible';
    };
    notes?: string | null;
    createdAt: Timestamp;
}

// ─── Properties ───────────────────────────────────────────────────────────────
export type PropertyType = 'sale' | 'rent';

export type PropertyStatus =
    | 'active'
    | 'pending'
    | 'sold'
    | 'rented'
    | 'expired'
    | 'withdrawn';

export interface Property {
    id: string;
    agencyId: string;
    agentId: string; // uid of the responsible agent
    address: string;
    city?: string;
    type: PropertyType;
    kind?: string;
    price: number;
    rooms?: number;
    status: PropertyStatus;
    exclusivityEndDate?: Timestamp | null;
    isExclusive?: boolean;
    daysOnMarket: number;
    description?: string;
    images?: string[];
    imageUrls?: string[];
    lat?: number;
    lng?: number;
}

// ─── Deals ────────────────────────────────────────────────────────────────────
export type DealStage = 'qualification' | 'viewing' | 'offer' | 'negotiation' | 'contract' | 'won' | 'lost';

export interface Deal {
    id: string;
    agencyId: string;
    agentId?: string; // Often referred to alongside createdBy, mapped via createdBy
    createdBy: string;
    propertyId: string;
    leadId: string;
    notes?: string;
    stage: DealStage;
    probability?: number;
    projectedCommission: number;
    actualCommission?: number;
    createdAt: Timestamp;
    updatedAt?: Timestamp;
}

// ─── Tasks ────────────────────────────────────────────────────────────────────
export interface AppTask {
    id: string;
    agencyId: string;
    createdBy: string; // agentId
    title: string;
    description?: string;
    dueDate: Timestamp;
    priority: 'High' | 'Medium' | 'Low';
    isCompleted: boolean;
    completedAt?: Timestamp | null;
    relatedTo?: {
        id: string;
        type: 'lead' | 'property';
    };
    createdAt?: Timestamp;
}

// ─── Shared Catalogs ──────────────────────────────────────────────────────────
export interface SharedCatalog {
    id: string;
    agencyId: string;
    agentId: string;
    leadId: string | null;
    leadName?: string;
    properties: {
        id: string;
        address: string;
        city?: string;
        price: number;
        rooms: number | null;
        images: string[];
        type: PropertyType;
    }[];
    viewCount: number;
    createdAt: Timestamp;
    expiresAt: Timestamp;
}

// ─── Alerts ───────────────────────────────────────────────────────────────────
export type AlertType = 'warning' | 'info' | 'deal_won';

export interface Alert {
    id: string;
    agencyId: string;
    targetAgentId: string; // uid OR 'all' for agency-wide broadcasts
    message: string;
    title?: string;
    type: AlertType;
    isRead: boolean;
    relatedTo?: {
        id: string;
        type: 'deal' | 'lead' | 'property' | 'task';
    };
    createdAt?: Timestamp;
}

import { Timestamp } from 'firebase/firestore';

export type TimeRange = '1m' | '3m' | '6m' | '1y';

// ─── Agencies ────────────────────────────────────────────────────────────────
export type AgencySpecialization = 'residential' | 'commercial' | 'luxury' | 'new_projects';

export interface Agency {
    id: string;
    name: string;
    // Extended professional profile (set during onboarding)
    agencyName?: string;
    logoUrl?: string; // added to support the root-level logoUrl duplication
    slogan?: string;
    officePhone?: string;
    licenseNumber?: string;
    mainServiceArea?: string;
    specialization?: AgencySpecialization;
    subscriptionTier: 'free' | 'pro' | 'enterprise';
    planId?: string;
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
    billing?: {
        planId?: string;
        status?: string;
        trialEndsAt?: any; // Firestore Timestamp
        ownerPhone?: string;
    };
    settings: {
        logoUrl?: string;
        themeColor?: string;
        customDealStages?: CustomDealStage[];
        activeGlobalCities?: string[]; // Multiple service regions to pull global properties from
    };
    whatsappIntegration?: {
        status?: string;
        instanceId?: string;
        monitoredGroups?: { id: string, name: string }[];
    };
    isWhatsappConnected?: boolean;
    createdAt: Timestamp;
}

export interface CustomDealStage {
    id: string;          // A unique string identifier, e.g., 'stage_123'
    label: string;       // User-facing name, e.g., 'ממתין לחתימה'
    color: string;       // Text color class (e.g. 'text-indigo-700')
    bg: string;          // Background class (e.g. 'bg-indigo-100')
    border: string;      // Border class (e.g. 'border-indigo-200')
    headerBg: string;    // Header class (e.g. 'bg-indigo-50')
}

// ─── Users ────────────────────────────────────────────────────────────────────
export type UserRole = 'admin' | 'agent';

export type AgentSpecialization = 'sale' | 'rent' | 'commercial';

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
    /** Which deal types this agent handles (sale, rent, commercial) */
    specializations?: AgentSpecialization[];
    /** Cities or neighborhoods this agent covers */
    serviceAreas?: string[];
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
    Preferences?: UserPreferences;
    whatsappTemplates?: { id: string; name: string; content: string }[];
    googleCalendar?: {
        enabled: boolean;
        connectedAt?: Timestamp;
        error?: string;
    };
    createdAt?: Timestamp;
    inviteToken?: string; // Random token for secure invitations
    hasSeenTour?: boolean;
    hasSeenWelcome?: boolean;
}

export interface UserPreferences {
    theme?: 'light' | 'dark';
    sidebarOpen?: boolean;
    dashboardLayout?: any[]; // layout items for react-grid-layout
    lastUpdated?: Timestamp | null;
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
        desiredNeighborhoods?: string[];
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
        weights?: {
            budget: number;
            rooms: number;
            location: number;
            amenities: number;
        };
    };
    catalogId?: string | null;
    catalogUrl?: string | null;
    notes?: string | null;
    /** Controls whether the AI WhatsApp bot is allowed to auto-reply to this lead. */
    isBotActive?: boolean;
    createdAt: Timestamp;
}

// ─── Properties ───────────────────────────────────────────────────────────────
export type PropertyType = 'sale' | 'rent' | 'commercial';

export type PropertyStatus =
    | 'active'
    | 'pending'
    | 'sold'
    | 'rented'
    | 'expired'
    | 'withdrawn'
    | 'draft'; // Added for WhatsApp group parsed drafts

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
    sqm?: number;
    status: PropertyStatus;
    exclusivityEndDate?: Timestamp | null;
    isExclusive?: boolean;
    daysOnMarket: number;
    description?: string;
    street?: string;
    neighborhood?: string;
    propertyType?: string;
    ingestedAt?: any;
    source?: string;
    floor?: number | null;


    // Draft properties (WhatsApp parsing)
    rawDescription?: string;
    groupId?: string;
    externalAgentPhone?: string;
    externalAgentName?: string;
    street?: string;
    neighborhood?: string;
    floor?: number;
    description?: string;
    originalSource?: string;
    externalLink?: string;

    images?: string[];
    imageUrls?: string[];
    videoUrl?: string;
    lat?: number;
    lng?: number;
    leadId?: string;
    listingType?: 'exclusive' | 'external' | 'private';
    agencyName?: string;
    yad2Link?: string;
    isGlobalCityProperty?: boolean;
    readonly?: boolean;

    // Amenities and detailed metadata
    condition?: string;
    floorsTotal?: number;
    hasElevator?: boolean;
    hasParking?: boolean;
    hasBalcony?: boolean;
    hasSafeRoom?: boolean;
    hasBars?: boolean;
    hasAirCondition?: boolean;

    // External agency details
    externalAgencyName?: string;
    externalContactName?: string;
}

export interface PendingLead {
    id: string;
    agencyId: string;
    phone: string;
    name?: string | null;
    initialMessage: string;
    aiSummary?: string;
    aiIntent?: 'buy' | 'rent' | 'sell' | 'inquiry';
    createdAt?: Timestamp;
    expiresAt?: number;
}

// ─── Deals ────────────────────────────────────────────────────────────────────
export type DealStage = string; // Permits dynamic custom stages

export interface Deal {
    id: string;
    agencyId: string;
    agentId?: string; // Often referred to alongside createdBy, mapped via createdBy
    createdBy: string;
    propertyId: string;
    buyerId?: string;
    sellerId?: string;
    leadId?: string;
    notes?: string;
    stage: DealStage;
    probability?: number;
    projectedCommission: number;
    actualCommission?: number;
    isVatIncluded?: boolean;
    createdAt: Timestamp;
    updatedAt?: Timestamp;
}

// ─── Tasks ────────────────────────────────────────────────────────────────────
export interface AppTask {
    id: string;
    agencyId: string;
    createdBy: string; // agentId of who created the task
    assignedToAgentId?: string; // agentId of who the task is assigned to (may differ from createdBy)
    title: string;
    description?: string;
    dueDate: Timestamp;
    priority: 'High' | 'Medium' | 'Low';
    isCompleted: boolean;
    completedAt?: Timestamp | null;
    relatedTo?: {
        id: string;
        type: 'lead' | 'property';
        name?: string;
    };
    googleEventId?: string;
    createdAt?: Timestamp;
}


// ─── Shared Catalogs ──────────────────────────────────────────────────────────
export interface SharedCatalog {
    id: string;
    agencyId: string;
    agencyName?: string;
    agencyLogoUrl?: string;
    agencyPhone?: string;
    agentId: string;
    leadId: string | null;
    leadName?: string;
    propertyIds: Array<string | { id: string; collectionPath: string }>;
    viewCount: number;
    likedPropertyIds?: string[];
    leadRequirements?: {
        desiredCity?: string[];
        desiredNeighborhoods?: string[];
        maxBudget?: number | null;
        minRooms?: number | null;
        maxRooms?: number | null;
        minSizeSqf?: number | null;
        floorMin?: number | null;
        floorMax?: number | null;
        propertyType?: string[];
        mustHaveElevator?: boolean;
        mustHaveParking?: boolean;
        mustHaveBalcony?: boolean;
        mustHaveSafeRoom?: boolean;
        condition?: string;
        urgency?: string;
        weights?: {
            budget: number;
            rooms: number;
            location: number;
            amenities: number;
        };
    } | null;
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

// ─── Expenses ─────────────────────────────────────────────────────────────────
export type ExpenseCategory = 'Marketing' | 'Rent' | 'Salaries' | 'Other';

export interface Expense {
    id: string;
    agencyId: string;
    title: string;
    amount: number;
    category: ExpenseCategory | string;
    date: Timestamp; // Using Firestore Timestamp to maintain consistency
    createdBy: string;
    createdAt: Timestamp;
    isRecurring?: boolean;
}

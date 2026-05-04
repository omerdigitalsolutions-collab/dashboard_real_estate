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
        franchisePercent?: number;     // % of each deal commission paid to franchisor
        monthlyFranchiseFee?: number;  // Fixed monthly fee paid to franchisor (₪)
    };
    whatsappIntegration?: {
        status?: string;
        instanceId?: string;
        monitoredGroups?: { id: string, name: string }[];
    };
    isWhatsappConnected?: boolean;
    joinCode?: string;
    isJoinCodeEnabled?: boolean;
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
    /** Percentage of deal commission the agent keeps (default 50) */
    commissionPercent?: number;
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
        desiredStreet?: string[];
        transactionType?: 'sale' | 'rent' | 'forsale';
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
    // Collaboration fields for Marketplace
    collaborationStatus?: 'private' | 'collaborative';
    collaborationTerms?: string;
    collaborationAgentName?: string; // name of the agent to show in marketplace
    // Call tracking
    lastCallId?: string | null;
    lastCallAt?: Timestamp | null;
    callCount?: number;
    createdAt: Timestamp;
}

// ─── Call Logs ────────────────────────────────────────────────────────────────
export type CallStatus = 'ringing' | 'in-progress' | 'completed' | 'missed' | 'failed' | 'busy';

export interface CallLog {
    id: string;
    agencyId: string;
    agentId: string;
    callSid: string;
    from: string;
    to: string;
    status: CallStatus;
    direction: 'inbound';
    duration: number | null;
    storagePath: string | null;
    transcription: string | null;
    summary: string | null;
    clientName: string | null;
    leadId: string | null;
    leadCreated: boolean;
    missedCallHandled: boolean;
    startedAt: Timestamp;
    endedAt: Timestamp | null;
    createdAt: Timestamp;
}

// ─── Properties ───────────────────────────────────────────────────────────────
export type PropertyStatus =
    | 'active'
    | 'pending'
    | 'sold'
    | 'rented'
    | 'expired'
    | 'withdrawn'
    | 'draft';

export interface Property {
    id: string;
    agencyId: string;
    transactionType: 'forsale' | 'rent';
    propertyType: string;
    status: PropertyStatus;
    rooms?: number | null;
    floor?: number | null;
    totalFloors?: number | null;
    squareMeters?: number | null;
    isExclusive?: boolean;
    exclusivityEndDate?: Timestamp | null;
    ingestedAt?: any;
    source?: string;
    listingType?: 'exclusive' | 'external' | 'private';
    visibility?: 'public' | 'private' | 'draft';
    slug?: string;
    seoDescription?: string;
    isGlobalCityProperty?: boolean;
    importedFromGlobal?: boolean;
    originalGlobalId?: string;
    readonly?: boolean;
    yad2Link?: string;
    listingUrl?: string;
    leadId?: string;

    address: {
        city: string;
        street?: string;
        number?: string;
        neighborhood?: string;
        fullAddress: string;
        coords?: {
            lat: number;
            lng: number;
        };
    };

    features: {
        hasElevator?: boolean | null;
        hasParking?: boolean | null;
        parkingSpots?: number | null;
        hasBalcony?: boolean | null;
        hasMamad?: boolean | null;
        hasStorage?: boolean | null;
        isRenovated?: boolean | null;
        isFurnished?: boolean | null;
        hasAirConditioning?: boolean | null;
    };

    financials: {
        price: number;
        originalPrice?: number | null;
    };

    media: {
        mainImage?: string | null;
        images?: string[];
        videoTourUrl?: string | null;
    };

    management: {
        assignedAgentId?: string | null;
        assignedAgentName?: string | null;
        descriptions?: string | null;
    };

    // WhatsApp / external draft fields
    rawDescription?: string;
    groupId?: string;
    externalAgentPhone?: string;
    externalAgentName?: string;
    externalAgencyName?: string;
    externalContactName?: string;
    contactName?: string;
    contactPhone?: string;
    originalSource?: string;
    externalLink?: string;
    listingId?: string;
    hasAgent?: boolean;

    // Collaboration fields
    collaborationStatus?: 'private' | 'collaborative';
    collaborationTerms?: string;
    sharedWithAgencies?: string[];

    createdAt?: Timestamp;
    updatedAt?: Timestamp;
}

// ─── B2C Search Alerts ────────────────────────────────────────────────────────
export interface SearchAlert {
    id?: string;
    phone: string;
    filters: {
        city?: string;
        minPrice?: number;
        maxPrice?: number;
        rooms?: number;
        propertyType?: string;
        transactionType?: 'forsale' | 'rent';
        rawQuery?: string;
    };
    active: boolean;
    lastNotified?: Timestamp;
    createdAt: Timestamp;
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
    // UI Virtual Fields
    clientName?: string;
    propertyAddress?: string;
    createdAt: Timestamp;
    updatedAt?: Timestamp;
    contract?: {
        contractId: string;
        pdfUrl: string;
        signedPdfUrl?: string;
        status: 'pending' | 'completed';
    };
}

// ─── Tasks ────────────────────────────────────────────────────────────────────
export interface TaskNote {
    text: string;
    createdBy: string;
    createdAt: Timestamp;
}

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
    notes?: TaskNote[];
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
    title?: string;
    propertyIds: Array<string | { id: string; collectionPath: string }>;
    viewCount: number;
    likedPropertyIds?: string[];
    leadRequirements?: {
        desiredCity?: string[];
        desiredNeighborhoods?: string[];
        desiredStreet?: string[];
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

// ─── Contracts & Digital Signatures ──────────────────────────────────────────

export interface FieldPosition {
    x: number;       // normalized 0–1 (left edge, % of page width)
    y: number;       // normalized 0–1 (top edge, % of page height)
    width: number;   // normalized 0–1
    height: number;  // normalized 0–1
    page: number;    // 1-indexed
}

export interface Field {
    id: string;
    type: 'signature' | 'text' | 'date';
    role: 'agent' | 'client';
    label?: string;           // human-readable label (e.g., "Client Signature")
    value?: string;           // base64 PNG for signature, plain string for text/date
    required?: boolean;       // true if this field must be filled
    position: FieldPosition;
}

export interface Contract {
    id?: string;
    agencyId: string;
    dealId?: string;
    source: 'pdf_upload' | 'scan';
    originalFileUrl: string;  // original template PDF or scanned image
    signedPdfUrl?: string;
    status: 'draft' | 'active' | 'completed';
    viewedAt?: Timestamp;
    viewCount?: number;
    fields: Field[];
    createdBy: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
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

// ─── Audit Logs ───────────────────────────────────────────────────────────────
export interface AuditLog {
    id: string;
    type: 'contract_opened' | 'contract_signed' | string;
    contractId: string;
    dealId: string;
    agencyId: string;
    signedBy?: string;
    signedByEmail?: string;
    ipAddress?: string;
    signedPdfUrl?: string;
    fieldCount?: number;
    createdAt: Timestamp;
}

// ─── AI Text Contracts ────────────────────────────────────────────────────────
export interface TemplateField {
    id: string;
    label: string;
    type: 'text' | 'date' | 'signature';
    role: 'agent' | 'client';
    mappingTarget?: string;
    required?: boolean;
}

export interface ContractTemplate {
    id?: string;
    agencyId: string;
    title: string;
    rawText: string;
    taggedText: string;
    fieldsMetadata: TemplateField[];
    createdBy: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

export interface ContractInstance {
    id?: string;
    agencyId: string;
    templateId: string;
    dealId?: string;
    leadId?: string;
    status: 'draft' | 'sent' | 'signed';
    values: Record<string, string>;
    createdBy: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

// ─── Collaborations ───────────────────────────────────────────────────────────
export interface CollaborationRequest {
    id: string;
    propertyId: string;
    propertyAgencyId: string;
    requestingAgencyId: string;
    requestingAgentId: string;
    leadId?: string;
    status: 'pending' | 'approved' | 'rejected' | 'contract_signed';
    terms?: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

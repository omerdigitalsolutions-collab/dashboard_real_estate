/**
 * ─── Bot Action Handlers ──────────────────────────────────────────────────────
 *
 * Functions that the WhatsApp WeBot can call via Gemini function-calling.
 * These handle CREATE-only operations: property, lead, and agent.
 *
 * Security:
 *   - All functions validate required fields before Firestore writes
 *   - No UPDATE or DELETE operations
 *   - Bot acts with the agency context only
 */

import * as admin from 'firebase-admin';

const db = admin.firestore();

// ─── Create Property ──────────────────────────────────────────────────────────

export interface CreatePropertyParams {
  city: string;
  street?: string;
  propertyType: string; // 'apartment', 'house', 'commercial', etc.
  rooms?: number;
  price: number;
  transactionType: 'forsale' | 'rent'; // 'forsale' or 'rent'
  neighborhood?: string;
  floor?: number;
  totalFloors?: number;
  squareMeters?: number;
  hasElevator?: boolean;
  hasParking?: boolean;
  hasBalcony?: boolean;
  description?: string;
}

export async function createProperty(
  agencyId: string,
  params: CreatePropertyParams,
): Promise<{ success: boolean; propertyId?: string; reason?: string; message: string }> {
  // Required field validation
  if (!params.city || !params.city.trim()) {
    return { success: false, reason: 'missing_city', message: 'חסר שדה חובה: עיר.' };
  }
  if (!params.propertyType || !params.propertyType.trim()) {
    return { success: false, reason: 'missing_property_type', message: 'חסר שדה חובה: סוג נכס (דירה, בית, וכו׳).' };
  }
  if (typeof params.price !== 'number' || params.price <= 0) {
    return { success: false, reason: 'missing_price', message: 'חסר שדה חובה: מחיר תקין.' };
  }
  if (!params.transactionType || !['forsale', 'rent'].includes(params.transactionType)) {
    return { success: false, reason: 'invalid_transaction_type', message: 'סוג עסקה חייב להיות "למכירה" או "להשכרה".' };
  }

  try {
    const propertyRef = db.collection('agencies').doc(agencyId).collection('properties').doc();

    const fullAddress = [params.street, params.city].filter(Boolean).join(', ');

    await propertyRef.set({
      id: propertyRef.id,
      agencyId,
      transactionType: params.transactionType,
      propertyType: params.propertyType.trim(),
      status: 'active',
      rooms: params.rooms ?? null,
      floor: params.floor ?? null,
      totalFloors: params.totalFloors ?? null,
      squareMeters: params.squareMeters ?? null,

      address: {
        city: params.city.trim(),
        street: params.street?.trim() || null,
        neighborhood: params.neighborhood?.trim() || null,
        fullAddress: fullAddress.trim(),
        coords: null,
      },

      features: {
        hasElevator: params.hasElevator ?? null,
        hasParking: params.hasParking ?? null,
        hasBalcony: params.hasBalcony ?? null,
        hasMamad: null,
        hasStorage: null,
        isRenovated: null,
        isFurnished: null,
        hasAirConditioning: null,
      },

      financials: {
        price: Math.round(params.price),
        originalPrice: null,
      },

      media: {
        mainImage: null,
        images: [],
        videoTourUrl: null,
      },

      management: {
        assignedAgentId: null,
        descriptions: params.description?.trim() || null,
      },

      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[BotActions] Property created: ${propertyRef.id} in ${params.city}`);
    return {
      success: true,
      propertyId: propertyRef.id,
      message: `נכס חדש נוצר בהצלחה: ${params.propertyType} ב${params.city}.`,
    };
  } catch (err: any) {
    console.error('[BotActions] createProperty failed:', err?.message);
    return {
      success: false,
      reason: 'database_error',
      message: 'שגיאה בשמירת הנכס. אנא נסה שנית.',
    };
  }
}

// ─── Create Lead ──────────────────────────────────────────────────────────────

export interface CreateLeadParams {
  name: string;
  phone: string;
  email?: string;
  propertyType?: string; // 'buyer' or 'seller'
  preferredCity?: string;
  desiredRooms?: number;
  maxBudget?: number;
  notes?: string;
}

export async function createLead(
  agencyId: string,
  params: CreateLeadParams,
): Promise<{ success: boolean; leadId?: string; reason?: string; message: string }> {
  // Required field validation
  if (!params.name || !params.name.trim()) {
    return { success: false, reason: 'missing_name', message: 'חסר שדה חובה: שם הליד.' };
  }
  if (!params.phone || !params.phone.trim()) {
    return { success: false, reason: 'missing_phone', message: 'חסר שדה חובה: מספר טלפון.' };
  }

  try {
    let phone = params.phone.trim().replace(/\D/g, '');
    if (phone.startsWith('972')) phone = '0' + phone.substring(3);

    const existing = await db
      .collection('leads')
      .where('agencyId', '==', agencyId)
      .where('phone', '==', phone)
      .limit(1)
      .get();

    if (!existing.empty) {
      const existingId = existing.docs[0].id;
      console.log(`[BotActions] Lead already exists: ${existingId} | phone ${phone}`);
      return {
        success: true,
        leadId: existingId,
        message: `ליד קיים כבר במערכת: ${params.name}.`,
      };
    }

    const leadRef = db.collection('leads').doc();

    await leadRef.set({
      agencyId,
      name: params.name.trim(),
      phone,
      email: params.email?.trim() || null,
      source: 'WhatsApp WeBot (Free Text)',
      type: 'buyer',
      status: 'new',
      requirements: {
        desiredCity: params.preferredCity ? [params.preferredCity.trim()] : [],
        maxBudget: params.maxBudget ?? null,
        minRooms: params.desiredRooms ?? null,
        propertyType: [],
      },
      notes: params.notes?.trim() || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[BotActions] Lead created: ${leadRef.id} | ${params.name}`);
    return {
      success: true,
      leadId: leadRef.id,
      message: `ליד חדש נוצר בהצלחה: ${params.name}.`,
    };
  } catch (err: any) {
    console.error('[BotActions] createLead failed:', err?.message);
    return {
      success: false,
      reason: 'database_error',
      message: 'שגיאה בשמירת הליד. אנא נסה שנית.',
    };
  }
}

// ─── Create Agent (User) ───────────────────────────────────────────────────────

export interface CreateAgentParams {
  name: string;
  phone: string;
  email?: string;
  role?: 'admin' | 'agent'; // Defaults to 'agent'
}

export async function createAgent(
  agencyId: string,
  params: CreateAgentParams,
): Promise<{ success: boolean; agentId?: string; reason?: string; message: string }> {
  // Required field validation
  if (!params.name || !params.name.trim()) {
    return { success: false, reason: 'missing_name', message: 'חסר שדה חובה: שם הסוכן.' };
  }
  if (!params.phone || !params.phone.trim()) {
    return { success: false, reason: 'missing_phone', message: 'חסר שדה חובה: מספר טלפון.' };
  }

  // Optional: Validate email if provided
  const normalizedEmail = params.email?.trim() || null;
  if (normalizedEmail) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return { success: false, reason: 'invalid_email', message: 'כתובת דוא״ל אינה תקינה.' };
    }
  }

  const normalizedRole: 'admin' | 'agent' = params.role === 'admin' ? 'admin' : 'agent';

  try {
    // Check if email already exists (if provided)
    if (normalizedEmail) {
      const existingSnap = await db
        .collection('users')
        .where('email', '==', normalizedEmail)
        .limit(1)
        .get();

      if (!existingSnap.empty) {
        const existingDoc = existingSnap.docs[0];
        if (existingDoc.data().uid) {
          // Don't expose 'email_exists' reason — avoids email enumeration
          return {
            success: false,
            reason: 'invalid_input',
            message: 'לא ניתן ליצור את הסוכן עם הפרטים שסופקו.',
          };
        }
      }
    }

    const agentRef = db.collection('users').doc();

    await agentRef.set({
      uid: null, // Will be populated when the user signs up
      email: normalizedEmail,
      name: params.name.trim(),
      phone: params.phone.trim(),
      role: normalizedRole,
      agencyId,
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[BotActions] Agent created: ${agentRef.id} | ${params.name} | role=${normalizedRole}`);
    return {
      success: true,
      agentId: agentRef.id,
      message: `סוכן חדש נוצר בהצלחה: ${params.name} (${normalizedRole === 'admin' ? 'מנהל' : 'סוכן'}).`,
    };
  } catch (err: any) {
    console.error('[BotActions] createAgent failed:', err?.message);
    return {
      success: false,
      reason: 'database_error',
      message: 'שגיאה בשמירת הסוכן. אנא נסה שנית.',
    };
  }
}

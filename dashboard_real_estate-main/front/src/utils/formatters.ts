/**
 * Formats a number or numeric string with comma as thousand separators.
 * Example: 3333333 -> "3,333,333"
 */
export function formatNumberWithCommas(value: string | number): string {
    if (value === undefined || value === null || value === '') return '';
    
    // Remove existing commas first if it's a string
    const cleanValue = typeof value === 'string' ? value.replace(/,/g, '') : value.toString();
    
    // Check if it's a valid number
    if (isNaN(Number(cleanValue))) return cleanValue;

    const parts = cleanValue.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
}

/**
 * Removes commas from a formatted numeric string.
 * Example: "3,333,333" -> "3333333"
 */
export function parseFormattedNumber(value: string): string {
    if (!value) return '';
    return value.replace(/,/g, '');
}

/**
 * Formats a price with a currency symbol (optional) and commas.
 */
export function formatPrice(value: number | string | undefined | null, showSymbol = true): string {
    if (value === undefined || value === null || value === '') return '';
    
    const num = typeof value === 'string' ? parseFloat(parseFormattedNumber(value)) : value;
    if (isNaN(num)) return '';
    
    const formatted = num.toLocaleString('he-IL');
    return showSymbol ? `₪${formatted}` : formatted;
}

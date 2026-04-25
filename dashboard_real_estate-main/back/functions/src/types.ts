export interface TemplateField {
    id: string;
    label: string;
    type: 'text' | 'date' | 'signature';
    role: 'agent' | 'client';
    mappingTarget?: string;
    required?: boolean;
}

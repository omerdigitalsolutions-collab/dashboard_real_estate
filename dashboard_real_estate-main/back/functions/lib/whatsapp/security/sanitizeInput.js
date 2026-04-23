"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeInput = sanitizeInput;
function sanitizeInput(text) {
    return text
        .replace(/\x00/g, '')
        .replace(/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
        .replace(/[ \t]+/g, ' ')
        .trim()
        .substring(0, 500);
}
//# sourceMappingURL=sanitizeInput.js.map
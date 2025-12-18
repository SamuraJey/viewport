/**
 * Authentication and user types
 */

export interface User {
    id: string;
    email: string;
    display_name: string | null;
    storage_used: number;
    storage_quota: number;
}

export interface AuthTokens {
    access_token: string;
    refresh_token: string;
    token_type?: string;
}

export interface LoginRequest {
    email: string;
    password: string;
}

export interface RegisterRequest {
    email: string;
    password: string;
    invite_code: string;
}

export interface LoginResponse {
    id: string;
    email: string;
    display_name: string | null;
    storage_used: number;
    storage_quota: number;
    tokens: AuthTokens;
}

export interface RegisterResponse {
    id: string;
    email: string;
}

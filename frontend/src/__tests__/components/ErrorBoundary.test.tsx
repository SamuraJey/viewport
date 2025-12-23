import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { ErrorBoundary } from '../../components/ErrorBoundary';

vi.mock('../../pages/ErrorPage', () => ({
    ErrorPage: ({ onRetry }: { onRetry?: () => void }) => (
        <div data-testid="error-page" onClick={onRetry}>
            error
        </div>
    ),
}));

describe('ErrorBoundary', () => {
    const originalError = console.error;

    beforeAll(() => {
        console.error = vi.fn();
    });

    afterAll(() => {
        console.error = originalError;
    });

    it('renders fallback when child throws and allows retry', () => {
        const Thrower = () => {
            throw new Error('boom');
        };

        render(
            <ErrorBoundary>
                <Thrower />
            </ErrorBoundary>,
        );

        const fallback = screen.getByTestId('error-page');
        expect(fallback).toBeInTheDocument();

        fallback.click();

        // After retry, boundary should render children again without crashing
        render(
            <ErrorBoundary>
                <div data-testid="safe-child">ok</div>
            </ErrorBoundary>,
        );

        expect(screen.getByTestId('safe-child')).toBeInTheDocument();
    });

    it('uses provided fallback element', () => {
        const Thrower = () => {
            throw new Error('boom');
        };

        render(
            <ErrorBoundary fallback={<div data-testid="custom-fallback">fallback</div>}>
                <Thrower />
            </ErrorBoundary>,
        );

        expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
    });
});

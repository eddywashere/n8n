import type { AuthenticatedRequest } from '@/requests';
import type { SamlPreferences } from './samlPreferences';

export declare namespace SamlConfiguration {
	type Update = AuthenticatedRequest<{}, {}, SamlPreferences, {}>;
	type Toggle = AuthenticatedRequest<{}, {}, { loginEnabled: boolean }, {}>;
}

import {createAuthClient} from '@neondatabase/auth';
import {BetterAuthVanillaAdapter} from '@neondatabase/auth/vanilla/adapters';
export function createClient() {
  return createAuthClient(location.origin+'/api/auth',{
    adapter:BetterAuthVanillaAdapter({fetchOptions:{credentials:'include'}})
  });
}

// The JSON store creates the demo therapist and client automatically on first run.
// This script is kept as a convenient, explicit setup command for the repository.
import { store } from './store.js';
console.log(`Demo data ready for ${store.dashboard().therapist.name}.`);

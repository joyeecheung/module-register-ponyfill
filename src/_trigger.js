// Trigger file for capturing ESM defaultResolve / defaultLoad.
//
// worker.js require()'s this file while temporary registerHooks() hooks are
// active. Because this is an ESM file (package "type": "module"), Node.js
// processes it via the ESM resolve/load. The static import below goes through
// the ESM resolution pipeline, so the hooks capture the ESM default
// resolve/load.
//
// We use a data: URL so there is little chance of colliding with a real module
// or triggering side effects. The capture hooks in worker.js match this exact
// URL to avoid accidentally intercepting unrelated imports.
import 'data:text/javascript,';

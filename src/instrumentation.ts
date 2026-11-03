import { installNetworkInspector } from './adapters/network/networkInspector.ts';

// This module is imported first by main.tsx, before any service or adapter is instantiated.
installNetworkInspector();

import { FileAssemblyRecordStore } from './file-assembly-store';
import type { AssemblyRecordStore } from './types';

const globalForAssembly = globalThis as typeof globalThis & {
  __asfAssemblyStore?: AssemblyRecordStore;
};

export function getAssemblyRecordStore(): AssemblyRecordStore {
  if (!globalForAssembly.__asfAssemblyStore) {
    globalForAssembly.__asfAssemblyStore = new FileAssemblyRecordStore();
  }
  return globalForAssembly.__asfAssemblyStore;
}

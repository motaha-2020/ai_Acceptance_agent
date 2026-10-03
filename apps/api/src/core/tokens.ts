/** DI tokens. Explicit @Inject everywhere: the build does not rely on emitDecoratorMetadata. */
export const CONFIG = Symbol('CONFIG');
export const PRISMA = Symbol('PRISMA');
export const STORAGE = Symbol('STORAGE');
export const QUEUE = Symbol('QUEUE');
export const LOGGER = Symbol('LOGGER');
export const PROVIDERS = Symbol('PROVIDERS');

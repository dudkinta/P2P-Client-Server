import { RolesService as RolesServiceClass } from './roles.js';

export function roles(init = {}) {
  return (components) => new RolesServiceClass(components, init);
}

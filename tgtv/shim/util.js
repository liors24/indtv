export const inspect = Object.assign(function (o) { try { return JSON.stringify(o); } catch (e) { return String(o); } }, { custom: Symbol('inspect.custom') });
export default { inspect };

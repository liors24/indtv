export const w3cwebsocket = (typeof WebSocket !== 'undefined' ? WebSocket : function () { throw new Error('WebSocket not available'); });

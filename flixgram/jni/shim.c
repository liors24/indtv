#include <jni.h>
extern int td_create_client_id(void);
extern void td_send(int client_id, const char *request);
extern const char *td_receive(double timeout);
extern const char *td_execute(const char *request);

static jbyteArray to_bytes(JNIEnv *env, const char *s) {
  if (!s) return 0;
  int n = 0; while (s[n]) n++;
  jbyteArray a = (*env)->NewByteArray(env, n);
  if (a) (*env)->SetByteArrayRegion(env, a, 0, n, (const jbyte *)s);
  return a;
}
JNIEXPORT jint JNICALL Java_tv_nova_app_Td_nCreate(JNIEnv *env, jclass c) { return td_create_client_id(); }
JNIEXPORT void JNICALL Java_tv_nova_app_Td_nSend(JNIEnv *env, jclass c, jint id, jbyteArray req) {
  jbyte *p = (*env)->GetByteArrayElements(env, req, 0);
  td_send(id, (const char *)p);
  (*env)->ReleaseByteArrayElements(env, req, p, JNI_ABORT);
}
JNIEXPORT jbyteArray JNICALL Java_tv_nova_app_Td_nReceive(JNIEnv *env, jclass c, jdouble timeout) {
  return to_bytes(env, td_receive(timeout));
}
JNIEXPORT jbyteArray JNICALL Java_tv_nova_app_Td_nExecute(JNIEnv *env, jclass c, jbyteArray req) {
  jbyte *p = (*env)->GetByteArrayElements(env, req, 0);
  const char *r = td_execute((const char *)p);
  (*env)->ReleaseByteArrayElements(env, req, p, JNI_ABORT);
  return to_bytes(env, r);
}

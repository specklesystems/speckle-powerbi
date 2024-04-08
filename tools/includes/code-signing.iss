#ifdef SIGN_INSTALLER
  #ifdef CODE_SIGNING_CERT_FINGERPRINT
    SignTool=byparam {#SourcePath}SignTool\signtool.exe sign /sha1 {#CODE_SIGNING_CERT_FINGERPRINT} /tr http://timestamp.digicert.com /td SHA512 /fd SHA512 $f
  #else
    #error "CODE_SIGNING_CERT_FINGERPRINT is not defined! Please provide the fingerprint of the certificate to use compile time define (i.e. /DCODE_SIGNING_CERT_FINGERPRINT=XXXXX) when invoking ISCC.exe"
  #endif
#endif

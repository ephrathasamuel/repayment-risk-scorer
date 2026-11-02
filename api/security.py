"""Password hashing (scrypt) and signed session tokens."""

import base64
import hashlib
import hmac
import os

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

_N, _R, _P = 2**14, 8, 1


def hash_password(password):
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    return "scrypt$" + base64.b64encode(salt).decode() + "$" + base64.b64encode(digest).decode()


def verify_password(password, stored):
    try:
        _, salt_b64, digest_b64 = stored.split("$")
    except ValueError:
        return False
    digest = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt_b64), n=_N, r=_R, p=_P, dklen=32)
    return hmac.compare_digest(digest, base64.b64decode(digest_b64))


class Tokens:
    def __init__(self, secret, max_age_seconds):
        self._s = URLSafeTimedSerializer(secret, salt="session")
        self.max_age = max_age_seconds

    def issue(self, user_id):
        return self._s.dumps({"uid": user_id})

    def read(self, token):
        try:
            return self._s.loads(token, max_age=self.max_age)["uid"]
        except (BadSignature, SignatureExpired, KeyError, TypeError):
            return None

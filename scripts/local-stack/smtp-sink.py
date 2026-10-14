# Captures outgoing e-mails (sign-up confirmation, password recovery) to a folder,
# so auth flows can be tested end-to-end without a real mail provider.
import asyncio, os, sys, time
from aiosmtpd.controller import Controller
out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/oe-mail"
os.makedirs(out, exist_ok=True)
class Sink:
    async def handle_DATA(self, server, session, envelope):
        name = f"{int(time.time()*1000)}-{envelope.rcpt_tos[0]}.eml"
        with open(os.path.join(out, name), "wb") as f:
            f.write(envelope.content)
        return "250 OK"
c = Controller(Sink(), hostname="127.0.0.1", port=int(os.environ.get("SMTP_PORT", "2500")))
c.start()
print("smtp sink on", c.port, flush=True)
asyncio.get_event_loop().run_forever()

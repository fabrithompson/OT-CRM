import httpx
import os
import asyncio
import threading
from flask import Flask, request, jsonify
from telethon import TelegramClient, events, errors, types
from telethon.utils import get_extension
from telethon.tl.types import MessageMediaWebPage

def _require_env(name):
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f'Variable de entorno requerida no configurada: {name}')
    return value

API_ID = _require_env('TELEGRAM_API_ID')
API_HASH = _require_env('TELEGRAM_API_HASH')
JAVA_WEBHOOK_URL = _require_env('JAVA_WEBHOOK_URL')
PUBLIC_URL = _require_env('PUBLIC_URL')
BOT_SECRET_KEY = _require_env('BOT_SECRET_KEY')

SESSION_FOLDER = 'sessions'
PHOTOS_FOLDER = 'static/photos'
MEDIA_FOLDER = 'static/media'

for folder in [SESSION_FOLDER, PHOTOS_FOLDER, MEDIA_FOLDER]:
    if not os.path.exists(folder):
        os.makedirs(folder)

app = Flask(__name__, static_folder='static')

global_loop = asyncio.new_event_loop()
asyncio.set_event_loop(global_loop)

active_clients = {}

def run_async(coro):
    if global_loop.is_running():
        return asyncio.run_coroutine_threadsafe(coro, global_loop).result()
    else:
        return global_loop.run_until_complete(coro)



def _detectar_tipo_media(message) -> str:
    if message.photo:    return "photo"
    if message.sticker:  return "sticker"
    if message.video:    return "video"
    if message.voice:    return "voice"
    if message.audio:    return "audio"
    return "document"


async def _procesar_media(event, device_session_id) -> tuple[str, str]:
    if not event.message.media or isinstance(event.message.media, MessageMediaWebPage):
        return "", "text"

    file_type = _detectar_tipo_media(event.message)
    ext = get_extension(event.message.media) or ".bin"
    if file_type == "photo" and ext == ".bin":
        ext = ".jpg"

    filename = f"msg_{event.message.id}_{device_session_id}{ext}"
    file_path = os.path.join(MEDIA_FOLDER, filename)

    print(f"📥 Descargando {file_type} ({ext}) de Telegram...")
    await event.client.download_media(event.message, file=file_path)

    file_url = f"{PUBLIC_URL}/static/media/{filename}"
    return file_url, file_type


async def _obtener_foto_perfil(event, sender) -> str:
    if not sender or not sender.photo:
        return ""
    try:
        profile_filename = f"profile_{sender.id}.jpg"
        profile_path = os.path.join(PHOTOS_FOLDER, profile_filename)
        if not os.path.exists(profile_path):
            await event.client.download_profile_photo(sender, file=profile_path)
        return f"{PUBLIC_URL}/static/photos/{profile_filename}"
    except Exception as pe:
        print(f"⚠️ Error foto perfil: {pe}")
        return ""


async def incoming_message_handler(event, device_session_id):
    try:
        sender = await event.get_sender()
        message_text = event.message.message or ""
        file_url, file_type = await _procesar_media(event, device_session_id)
        if file_url and not message_text:
            message_text = f"[{file_type.capitalize()}]"
        photo_url = await _obtener_foto_perfil(event, sender)
        payload = {
            "deviceId": device_session_id,
            "senderId": str(sender.id) if sender else "Unknown",
            "senderName": f"{sender.first_name or ''} {sender.last_name or ''}".strip() if sender else "Desconocido",
            "senderPhone": getattr(sender, 'phone', '') or '',
            "senderPhoto": photo_url,
            "message": message_text,
            "fileUrl": file_url,
            "fileType": file_type,
            "isGroup": event.is_group,
            "date": event.message.date.isoformat()
        }

        if JAVA_WEBHOOK_URL:
            async with httpx.AsyncClient(timeout=10.0) as client:
                headers = {"X-Bot-Token": BOT_SECRET_KEY}
                await client.post(JAVA_WEBHOOK_URL, json=payload, headers=headers)

    except Exception as e:
        print(f"❌ Error en handler: {e}")

async def get_client(user_id):
    global active_clients
    if user_id in active_clients:
        client = active_clients[user_id]
        if not client.is_connected():
            await client.connect()
        return client

    session_path = os.path.join(SESSION_FOLDER, user_id)
    client = TelegramClient(session_path, API_ID, API_HASH, loop=global_loop)
    await client.connect()

    client.add_event_handler(
        lambda e: incoming_message_handler(e, user_id),
        events.NewMessage(incoming=True)
    )

    active_clients[user_id] = client
    return client


@app.route('/', methods=['GET'])
@app.route('/status', methods=['GET'])
def status():
    return jsonify({"status": "RUNNING", "active_sessions": len(active_clients)})

@app.route('/request-code', methods=['POST'])
def request_code():
    data = request.json
    phone, user_id = data.get('phone'), data.get('user_id')
    try:
        async def do_request():
            client = await get_client(user_id)
            if not await client.is_user_authorized():
                sent = await client.send_code_request(phone)
                return {"phone_code_hash": sent.phone_code_hash, "status": "CODE_SENT"}
            return {"status": "ALREADY_LOGGED_IN"}
        return jsonify(run_async(do_request()))
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/submit-code', methods=['POST'])
def submit_code():
    data = request.json
    phone, code, ph_hash, user_id = data.get('phone'), data.get('code'), data.get('phone_code_hash'), data.get('user_id')
    try:
        async def do_login():
            client = await get_client(user_id)
            await client.sign_in(phone=phone, code=code, phone_code_hash=ph_hash)
            me = await client.get_me()
            return {"status": "CONNECTED", "username": me.username, "id": me.id}
        return jsonify(run_async(do_login()))
    except Exception as e:
        return jsonify({"error": str(e)}), 500
@app.route('/send-message', methods=['POST'])
def send_message():
    data = request.json
    user_id, chat_id, text = data.get('user_id'), data.get('chat_id'), data.get('text')
    try:
        async def do_send():
            client = await get_client(user_id)
            try:
                target = int(chat_id)
                await client.send_message(target, text)
            except (ValueError, TypeError):
                phone = str(chat_id) if str(chat_id).startswith('+') else '+' + str(chat_id)
                entity = await client.get_entity(phone)
                await client.send_message(entity, text)
            return {"status": "SENT"}
        return jsonify(run_async(do_send()))
    except Exception as e:
        return jsonify({"error": str(e)}), 500

async def _resolver_entidad(client, chat_id: str):
    str_id = str(chat_id)
    target = None
    if len(str_id) > 10 and not str_id.startswith('-'):
        try:
            phone = str_id if str_id.startswith('+') else '+' + str_id
            target = await client.get_entity(phone)
            print(f"Entidad encontrada por teléfono: {phone}")
        except Exception:
            print(f"No se encontró por teléfono {str_id}, probando otros métodos...")
    if not target:
        try:
            entity_input = int(str_id) if str_id.replace('-', '').isdigit() else str_id
            target = await client.get_entity(entity_input)
        except Exception:
            async for dialog in client.iter_dialogs(limit=100):
                if str(dialog.entity.id) == str_id:
                    target = dialog.entity
                    break
    if not target:
        raise ValueError(f"No se pudo encontrar al usuario {chat_id}. Asegurate de haberle escrito antes.")
    return target


@app.route('/send-media', methods=['POST'])
def send_media():
    data = request.json
    user_id = data.get('user_id')
    chat_id = data.get('chat_id')
    media_url = data.get('media_url')
    caption = data.get('caption', '')

    if not user_id or not chat_id or not media_url:
        return jsonify({"error": "Missing parameters"}), 400

    try:
        async def do_send_media():
            client = await get_client(user_id)
            target = await _resolver_entidad(client, chat_id)
            await client.send_file(target, media_url, caption=caption)
            return {"status": "SENT"}

        return jsonify(run_async(do_send_media()))
    except Exception as e:
        print(f"❌ Error media Telegram: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/logout', methods=['POST'])
def logout():
    user_id = request.json.get('user_id')
    if user_id in active_clients:
        client = active_clients[user_id]
        async def real_logout():
            if client.is_connected():
                await client.log_out()
        try:
            run_async(real_logout())
        except Exception as e:
            print(f"Error en log_out de Telegram: {e}")

        del active_clients[user_id]

    return jsonify({"status": "LOGGED_OUT"})

def startup_load_sessions():
    if not os.path.exists(SESSION_FOLDER):
        return
    for f in [f for f in os.listdir(SESSION_FOLDER) if f.endswith('.session')]:
        try:
            run_async(get_client(f.replace('.session', '')))
        except Exception:
            pass
startup_load_sessions()
def loop_in_thread(loop):
    asyncio.set_event_loop(loop)
    loop.run_forever()
t = threading.Thread(target=loop_in_thread, args=(global_loop,), daemon=True)
t.start()
if __name__ == '__main__':
    app.run(host='127.0.0.1', port=int(os.environ.get('PORT', 5000)))
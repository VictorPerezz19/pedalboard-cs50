"""Virtual Pedalboard & Tone Tracker - controlador principal (Flask)."""
import json
import os

from cs50 import SQL
from flask import Flask, flash, jsonify, redirect, render_template, request, session
from flask_session import Session
from werkzeug.security import check_password_hash, generate_password_hash

from helpers import apology, login_required

# Límites de validación (el frontend aplica los mismos)
MAX_ITEMS = 12          # máximo de piezas por pedalera
MAX_KNOBS = 10          # máximo de perillas por pieza

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "cambia-esto-en-produccion")
app.config["SESSION_PERMANENT"] = False
app.config["SESSION_TYPE"] = "filesystem"
Session(app)

db = SQL("sqlite:///pedalboard.db")


#  utilidades
def parse_settings(text):
    """Convierte el campo settings (JSON o texto libre) en un dict."""
    if not text:
        return {}
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            return data
    except (TypeError, ValueError):
        pass
    return {"Ajustes": text}     # texto plano antiguo


@app.template_filter("from_json")
def from_json_filter(value):
    """Filtro Jinja: {{ item.settings | from_json }}"""
    return parse_settings(value)


def attach_items(presets):
    """Añade a cada preset la lista de piezas ordenadas por posición."""
    for preset in presets:
        preset["items"] = db.execute(
            """SELECT pi.position, pi.settings, g.id AS gear_id, g.type, g.name
               FROM preset_items pi
               JOIN gear_catalog g ON g.id = pi.gear_id
               WHERE pi.preset_id = ?
               ORDER BY pi.position""",
            preset["id"],
        )
    return presets


def is_int(value):
    """True si es entero real (los booleanos de JSON no cuentan)."""
    return isinstance(value, int) and not isinstance(value, bool)


@app.after_request
def after_request(response):
    """Evita que el navegador cachee las respuestas."""
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Expires"] = 0
    response.headers["Pragma"] = "no-cache"
    return response


#  autenticación
@app.route("/register", methods=["GET", "POST"])
def register():
    """Registra un usuario nuevo."""
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        confirmation = request.form.get("confirmation", "")

        if not username:
            return apology("Debes escribir un nombre de usuario")
        if len(username) > 30:
            return apology("El usuario no puede superar 30 caracteres")
        if len(password) < 6:
            return apology("La contraseña debe tener al menos 6 caracteres")
        if password != confirmation:
            return apology("Las contraseñas no coinciden")

        try:
            user_id = db.execute(
                "INSERT INTO users (username, hash) VALUES (?, ?)",
                username, generate_password_hash(password),
            )
        except ValueError:      # violación del UNIQUE de username
            return apology("Ese nombre de usuario ya existe")

        session.clear()
        session["user_id"] = user_id
        flash("¡Cuenta creada! Bienvenido a tu pedalera.")
        return redirect("/")

    return render_template("register.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    """Inicia sesión."""
    session.clear()

    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")

        if not username or not password:
            return apology("Escribe usuario y contraseña", 403)

        rows = db.execute("SELECT * FROM users WHERE username = ?", username)
        if len(rows) != 1 or not check_password_hash(rows[0]["hash"], password):
            return apology("Usuario o contraseña incorrectos", 403)

        session["user_id"] = rows[0]["id"]
        return redirect("/")

    return render_template("login.html")


@app.route("/logout")
def logout():
    """Cierra la sesión."""
    session.clear()
    return redirect("/login")


# vistas
@app.route("/")
@login_required
def index():
    """Dashboard con los presets del usuario."""
    presets = db.execute(
        "SELECT id, name, description, created_at FROM presets "
        "WHERE user_id = ? ORDER BY created_at DESC, id DESC",
        session["user_id"],
    )
    return render_template("index.html", presets=attach_items(presets))


@app.route("/explore")
def explore():
    """Galería de presets predeterminados (user_id NULL)."""
    presets = db.execute(
        "SELECT id, name, description, created_at FROM presets "
        "WHERE user_id IS NULL ORDER BY name"
    )
    return render_template("explore.html", presets=attach_items(presets))


@app.route("/api/gear")
def api_gear():
    """Catálogo completo en JSON para el Builder."""
    gear = db.execute(
        "SELECT id, type, name, description, image_url FROM gear_catalog "
        "ORDER BY type, name"
    )
    return jsonify(gear)


@app.route("/builder", methods=["GET", "POST"])
@login_required
def builder():
    """GET: muestra el Builder. POST: guarda la cadena enviada como JSON."""
    if request.method == "POST":
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify(error="Se esperaba un JSON válido."), 400

        name = str(data.get("name", "")).strip()
        description = str(data.get("description", "")).strip()
        items = data.get("items")

        if not name or len(name) > 80:
            return jsonify(error="El nombre es obligatorio (máx. 80 caracteres)."), 400
        if len(description) > 300:
            return jsonify(error="La descripción no puede superar 300 caracteres."), 400
        if not isinstance(items, list) or not items:
            return jsonify(error="Añade al menos una pieza a la pedalera."), 400
        if len(items) > MAX_ITEMS:
            return jsonify(error=f"Máximo {MAX_ITEMS} piezas por pedalera."), 400

        valid_ids = {row["id"] for row in db.execute("SELECT id FROM gear_catalog")}
        clean_items = []

        # La posición se recalcula aquí: no nos fiamos del cliente.
        for position, item in enumerate(items, start=1):
            if not isinstance(item, dict):
                return jsonify(error="Formato de pieza no válido."), 400

            gear_id = item.get("gear_id")
            if not is_int(gear_id) or gear_id not in valid_ids:
                return jsonify(error="Una de las piezas no existe en el catálogo."), 400

            settings = item.get("settings", {})
            if not isinstance(settings, dict) or len(settings) > MAX_KNOBS:
                return jsonify(error="Ajustes de perillas no válidos."), 400

            clean = {}
            for knob, value in settings.items():
                knob = str(knob).strip()
                if not knob or len(knob) > 20 or not is_int(value) or not 1 <= value <= 10:
                    return jsonify(error="Cada perilla debe tener un valor entre 1 y 10."), 400
                clean[knob] = value

            clean_items.append((gear_id, position, json.dumps(clean, ensure_ascii=False)))

        preset_id = db.execute(
            "INSERT INTO presets (user_id, name, description) VALUES (?, ?, ?)",
            session["user_id"], name, description,
        )

        try:
            for gear_id, position, settings in clean_items:
                db.execute(
                    "INSERT INTO preset_items (preset_id, gear_id, position, settings) "
                    "VALUES (?, ?, ?, ?)",
                    preset_id, gear_id, position, settings,
                )
        except Exception:       # si algo falla, no dejamos un preset a medias
            db.execute("DELETE FROM preset_items WHERE preset_id = ?", preset_id)
            db.execute("DELETE FROM presets WHERE id = ?", preset_id)
            return jsonify(error="No se pudo guardar el preset."), 500

        flash(f"Preset «{name}» guardado.")
        return jsonify(ok=True, preset_id=preset_id, redirect="/")

    #  GET: opcionalmente precarga un preset (?from=ID) para duplicarlo
    initial = None
    from_id = request.args.get("from", type=int)
    if from_id:
        rows = db.execute(
            "SELECT id, user_id, name, description FROM presets "
            "WHERE id = ? AND (user_id IS NULL OR user_id = ?)",
            from_id, session["user_id"],
        )
        if rows:
            preset = rows[0]
            items = db.execute(
                "SELECT gear_id, settings FROM preset_items "
                "WHERE preset_id = ? ORDER BY position",
                preset["id"],
            )
            initial = {
                "name": preset["name"] + (" (copia)" if preset["user_id"] is None else ""),
                "description": preset["description"] or "",
                "items": [
                    {"gear_id": it["gear_id"], "settings": parse_settings(it["settings"])}
                    for it in items
                ],
            }

    return render_template("builder.html", initial=initial)


@app.route("/delete", methods=["POST"])
@login_required
def delete():
    """Elimina un preset del usuario."""
    preset_id = request.form.get("preset_id", type=int)
    if not preset_id:
        return apology("Preset no válido")

    # Solo borra si pertenece al usuario logueado
    db.execute(
        "DELETE FROM preset_items WHERE preset_id IN "
        "(SELECT id FROM presets WHERE id = ? AND user_id = ?)",
        preset_id, session["user_id"],
    )
    db.execute(
        "DELETE FROM presets WHERE id = ? AND user_id = ?",
        preset_id, session["user_id"],
    )
    flash("Preset eliminado.")
    return redirect("/")

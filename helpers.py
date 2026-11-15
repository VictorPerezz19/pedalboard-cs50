"""Utilidades compartidas: decorador de login y página de error."""
from functools import wraps

from flask import redirect, render_template, session


def apology(message, code=400):
    """Muestra una página de error con el mensaje y el código HTTP."""
    return render_template("apology.html", top=code, bottom=message), code


def login_required(f):
    """
    Decora rutas que exigen sesión iniciada.
    https://flask.palletsprojects.com/en/latest/patterns/viewdecorators/
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if session.get("user_id") is None:
            return redirect("/login")
        return f(*args, **kwargs)
    return decorated_function

from flask import Flask, jsonify

app = Flask(__name__)


@app.route('/info')
def hello_info():
    app.logger.info("This is a Info log")
    return "<p>Hello Info</p>"


@app.route('/error')
def hello_error():
    app.logger.error("This is an Error log")
    return "<p>Hello Error</p>"


@app.route('/critical')
def hello_critical():
    app.logger.critical("This is a Critical log")
    return "<p>Hello Critical</p>"


@app.route('/exception')
def hello_exception():
    try:
        1 / 0
    except BaseException:
        app.logger.exception("Unexpected error occurred")
        return "<p>Hello Exception</p>"


@app.route("/health")
def health():
    return jsonify({"status": "success"})


if __name__ == '__main__':
    app.debug = True
    app.run(host='0.0.0.0', port=5100)

from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
import json
import os

app = Flask(__name__)

# 数据库路径
basedir = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'kitchen.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# ================= 1. 数据库模型 =================

class Dish(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)
    price = db.Column(db.Float, default=0.0)
    category = db.Column(db.String(50), nullable=False)
    ingredients = db.Column(db.Text)
    steps = db.Column(db.Text)
    tips = db.Column(db.Text)
    image_data = db.Column(db.Text)

class Order(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(100))
    nickname = db.Column(db.String(100))
    time = db.Column(db.String(100))
    items = db.Column(db.Text)
    total = db.Column(db.String(50))

# 统一初始化数据库（确保所有表都创建）
with app.app_context():
    db.create_all()

# ================= 2. 路由接口 =================

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/dishes', methods=['GET'])
def get_dishes():
    dishes = Dish.query.all()
    output = {'chinese': {'dishes': {}}, 'western': {'dishes': {}}, 'japanese': {'dishes': {}}, 'dessert': {'dishes': {}}}
    for d in dishes:
        if d.category in output:
            output[d.category]["dishes"][d.name] = {
                "p": d.price,
                "i": json.loads(d.ingredients) if d.ingredients else [],
                "s": json.loads(d.steps) if d.steps else [],
                "tips": d.tips,
                "img": d.image_data or 'https://via.placeholder.com/400x200?text=No+Image'
            }
    return jsonify(output)

@app.route('/api/save_dish', methods=['POST'])
def save_dish():
    data = request.json
    dish = Dish.query.filter_by(name=data['old_name']).first()
    if not dish:
        dish = Dish(name=data['name'])
        db.session.add(dish)
    dish.name = data['name']
    dish.price = data['price']
    dish.category = data['category']
    dish.ingredients = json.dumps(data['ingredients'])
    dish.steps = json.dumps(data['steps'])
    dish.tips = data['tips']
    dish.image_data = data['image_data']
    db.session.commit()
    return jsonify({"status": "success"})

@app.route('/api/delete_dish', methods=['POST'])
def delete_dish():
    name = request.json.get('name')
    dish = Dish.query.filter_by(name=name).first()
    if dish:
        db.session.delete(dish)
        db.session.commit()
    return jsonify({"status": "deleted"})

@app.route('/api/orders', methods=['GET'])
def get_orders():
    orders = Order.query.order_by(Order.id.desc()).all()
    output = []
    for o in orders:
        output.append({
            "user": o.username,
            "nick": o.nickname,
            "time": o.time,
            "items": o.items,
            "total": o.total
        })
    return jsonify(output)

@app.route('/api/place_order', methods=['POST'])
def place_order():
    data = request.json
    new_order = Order(
        username=data['user'],
        nickname=data['nick'],
        time=data['time'],
        items=data['items'],
        total=data['total']
    )
    db.session.add(new_order)
    db.session.commit()
    return jsonify({"status": "success"})

# ================= 3. 启动入口 (必须在最后) =================

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=8080)
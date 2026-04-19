from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
import json
import os

app = Flask(__name__)

# 数据库路径
basedir = os.path.abspath(os.path.dirname(__file__))

# 【核心修改】优先读取 Render 后台的 DATABASE_URL，如果没有（比如在本地运行）则用 SQLite
db_url = os.environ.get('DATABASE_URL')

if db_url:
    # 兼容性处理：SQLAlchemy 要求必须是 postgresql:// 开头
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)
    app.config['SQLALCHEMY_DATABASE_URI'] = db_url
else:
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

# 【新增】云端用户表
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(100), unique=True, nullable=False)
    nickname = db.Column(db.String(100))
    password = db.Column(db.String(100))
    role = db.Column(db.String(50), default='guest')
    favs = db.Column(db.Text, default='[]') # 存收藏列表的 JSON 字符串

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

# 【新增】登录接口
@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.json
    # 如果是店长 Scarlett，且密码是 123，提供后门直接放行
    if data['username'] == 'Scarlett' and data['password'] == '123':
        return jsonify({"status": "success", "user": {"username": "Scarlett", "nickname": "店长Scarlett", "role": "admin", "favs": []}})
    
    # 查找云端数据库
    user = User.query.filter_by(username=data['username'], password=data['password']).first()
    if user:
        return jsonify({"status": "success", "user": {"username": user.username, "nickname": user.nickname, "role": user.role, "favs": json.loads(user.favs)}})
    
    return jsonify({"status": "fail", "msg": "账号或密码不对哦"})

# 【新增】注册接口
@app.route('/api/register', methods=['POST'])
def api_register():
    data = request.json
    if User.query.filter_by(username=data['username']).first() or data['username'] == 'Scarlett':
        return jsonify({"status": "fail", "msg": "用户名已被占用"})
    
    new_user = User(
        username=data['username'], 
        nickname=data.get('nickname', data['username']), 
        password=data['password'], 
        role='guest'
    )
    db.session.add(new_user)
    db.session.commit()
    return jsonify({"status": "success", "user": {"username": new_user.username, "nickname": new_user.nickname, "role": new_user.role, "favs": []}})

@app.route('/api/update_profile', methods=['POST'])
def update_profile():
    data = request.json
    user = User.query.filter_by(username=data['username']).first()
    if user:
        user.nickname = data['nickname']
        db.session.commit()
        return jsonify({"status": "success"})
    return jsonify({"status": "fail"})


# ================= 3. 启动入口 (必须在最后) =================

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=8080)
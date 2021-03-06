// @ts-check
import Watcher from './wathcer';

let $$id = 0;

const updater = {
  text(node, newVal) {
    node.textContent = typeof newVal === 'undefined' ? '' : newVal;
  },
  html(node, newVal) {
    node.innerHTML = typeof newVal === 'undefined' ? '' : newVal;
  },
  value(node, newVal) {
    // 当有输入的时候循环依赖了，中文输入法不能用。这里加入一个标志避开自动update
    if (!node.isInputting) {
      node.value = newVal || '';
    }
    node.isInputting = false;
  },
  checkbox(node, newVal) {
    // 处理数组
    const value = node.value || node.$id;
    if (newVal.indexOf(value) < 0) {
      node.checked = false;
    } else {
      node.checked = true;
    }
  },
  attr(node, newVal, attrName) {
    newVal = typeof newVal === 'undefined' ? '' : newVal;
    node.setAttribute(attrName, newVal);
  },
  style(node, newVal, attrName) {
    newVal = typeof newVal === 'undefined' ? '' : newVal;
    if (attrName === 'display') {
      newVal = newVal ? 'initial' : 'none';
    }
    node.style[attrName] = newVal;
  },
  dom(node, newVal, nextNode) {
    if (newVal) {
      nextNode.parentNode.insertBefore(node, nextNode);
    } else {
      nextNode.parentNode.removeChild(node);
    }
  },
};
export default class Compiler {
  $el;
  vm;
  $fragment;
  constructor(options) {
    this.$el = options.el;
    this.vm = options.vm;
    if (this.$el) {
      /* eslint no-underscore-dangle: 0*/
      // 先从dom挂载到js内存中
      this.$fragment = this._nodeToFragment();
      this.compile(this.$fragment);
      this.$el.appendChild(this.$fragment);
    }
  }
  compile(node, scope) {
    node.$id = $$id;
    $$id += 1;

    if (node.childNodes.length > 0) {
      [...node.childNodes].forEach((child) => {
        switch (child.nodeType) {
          case 3:
            this.compileTextNode(child, scope);
            break;
          case 1:
            this.compileElementNode(child, scope);
            break;
          default:
        }
      });
    }
  }
  compileElementNode(node, scope = this.vm) {
    const attrs = [...node.attributes];
    let lazyCompileDir = '';
    let lazyCompileExp = '';

    attrs.forEach((attr) => {
      const attrName = attr.name;
      const exp = attr.value;
      const dir = this._checkDirective(attrName);

      if (dir.type) {
        if (dir.type === 'if' || dir.type === 'for') {
          lazyCompileDir = dir.type;
          lazyCompileExp = exp;
        } else {
          const handler = this[`${dir.type}Handler`].bind(this);
          if (handler) {
            handler(node, scope, exp, dir.prop);
          } else {
            console.error(`找不到${dir.type}指令`);
          }
        }
      }
      node.removeAttribute(attrName);
    });
    // TODO if for不能共存
    if (lazyCompileExp) {
      this[`${lazyCompileDir}Handler`](node, scope, lazyCompileExp);
    } else {
      // 向下遍历节点
      this.compile(node, scope);
    }
  }
  _checkDirective(attrName) {
    const dir = {};
    if (attrName.indexOf('f-') === 0) {
      const parse = attrName.substring(2).split(':');
      dir.type = parse[0];
      dir.prop = parse[1];
    } else if (attrName.indexOf('@') === 0) {
      dir.type = 'on';
      dir.prop = attrName.substring(1);
    } else if (attrName.indexOf(':') === 0) {
      dir.type = 'bind';
      dir.prop = attrName.substring(1);
    }
    return dir;
  }
  compileTextNode(node, scope) {
    const text = node.textContent.trim();
    if (text) {
      const exp = this._parseTextExp(text);
      this.textHandler(node, scope || this.vm, exp);
    }
  }
  // v-text
  textHandler(node, scope, exp) {
    this.bindWatcher(node, scope, exp, 'text', undefined);
  }

  ifHandler(node, scope, exp) {
    // 先编译子元素，然后根据表达式决定是否插入dom中
    // PS：这里需要先插入一个占位元素来定位，不能依赖其他元素，万一其他元素没了呢？
    this.compile(node, scope);
    const refNode = document.createTextNode('');
    node.parentNode.insertBefore(refNode, node);
    const current = node.parentNode.removeChild(node);
    this.bindWatcher(current, scope, exp, 'dom', refNode); // refNode是引用关系，移动到parentNode后会自动更新位置，所以可以传入
  }
  /**
 *
 *
 * @param {any} node
 * @param {any} scope
 * @param {any} exp
 * @param {any} dir 绑定类型
 * @param {any} prop
 * @memberof Compile
 */
  bindWatcher(node, scope, exp, dir, prop) {
    const updateFn = updater[dir];
    /* eslint-disable no-new */
    new Watcher(exp, scope, (newVal) => {
      updateFn(node, newVal, prop);
    });
    /* eslint-enable no-new */
  }
  /**
   * {{name}号码{{tel}}} => `name+'号码'+tel`
   * 用于eval
   *
   * @param {any} text
   * @returns
   * @memberof Compile
   */
  _parseTextExp(text) {
    const regText = /\{\{((?:.|\n)+?)\}\}/g;
    const pieces = text.split(regText);
    const matches = text.match(regText); // 模板数组
    const tokens = [];

    pieces.forEach((piece) => {
      if (matches && matches.indexOf(`{{${piece}}}`) > -1) {
        tokens.push(piece);
      } else if (piece) {
        tokens.push(JSON.stringify(piece));
      }
    });
    return tokens.join('+');
  }
  _nodeToFragment() {
    const fragment = document.createDocumentFragment();

    [...this.$el.childNodes].forEach((child) => {
      if (this._isIgnorable(child)) {
        this.$el.removeChild(child);
      } else {
        fragment.appendChild(child);
      }
    });
    return fragment;
  }
  _isIgnorable(node) {
    const regIgnorable = /^[\t\n\r]+/;
    return node.nodeType === 8 || (node.nodeType === 3 && regIgnorable.test(node.textContent));
  }
}

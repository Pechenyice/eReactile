/** @jsxRuntime classic */
/** @jsx EReactile.createElement */

/**
 * jsx is parsed in something like {type: 'h1', props: {isMain: true}, EReactile.createElement('h2', null) }
 */
function createElement(type, props, ...children) {
  return {
    type,
    props: {
      ...props,
      children: children.map((child) =>
        typeof child === 'object' ? child : createTextElement(child)
      ),
    },
  };
}

/**
 * is used to render primitive string
 */
function createTextElement(text) {
  return {
    type: 'TEXT_ELEMENT',
    props: {
      nodeValue: text,
      children: [],
    },
  };
}

/**
 * when fiber needs dom in the document, it is created with this function (it's just create element of fiber type and sets all fiber own props to this node)
 */
function createDOM(fiber) {
  const dom =
    fiber.type === 'TEXT_ELEMENT'
      ? document.createTextNode('')
      : document.createElement(fiber.type);
  const isProperty = (key) => key !== 'children';
  Object.keys(fiber.props)
    .filter(isProperty)
    .forEach((name) => {
      dom[name] = fiber.props[name];
    });

  return dom;
}

/**
 * helpers
 */
const isEvent = (key) => key.startsWith('on');
const isProperty = (key) => key !== 'children' && !isEvent(key);
const isNew = (prev, next) => (key) => prev[key] !== next[key];
const isGone = (prev, next) => (key) => !(key in next);

/**
 * update node with all props and listeners
 */
function updateDom(dom, prevProps, nextProps) {
  //Remove old or changed event listeners
  Object.keys(prevProps)
    .filter(isEvent)
    .filter((key) => !(key in nextProps) || isNew(prevProps, nextProps)(key))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.removeEventListener(eventType, prevProps[name]);
    });

  // Add event listeners
  Object.keys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.addEventListener(eventType, nextProps[name]);
    });

  // Remove old properties
  Object.keys(prevProps)
    .filter(isProperty)
    .filter(isGone(prevProps, nextProps))
    .forEach((name) => {
      dom[name] = '';
    });

  // Set new or changed properties
  Object.keys(nextProps)
    .filter(isProperty)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      dom[name] = nextProps[name];
    });
}

/**
 * to prevent partial render UI, we append root in container only after all work is done
 */
function commitRoot() {
  // deleting all old fibers and it's children first
  deletions.forEach(commitWork);
  commitWork(wipRoot.child);
  // we save current iteration root fiber for later reconciliation (comparing with new rrot fiber)
  currentRoot = wipRoot;
  // we nullify current iteration root fiber
  wipRoot = null;
}

/**
 * by fiber logic it is done rendering all children and when it's done - all siblings
 * if tags are update or delete it is updating or deleting fiber from node
 */
function commitWork(fiber) {
  if (!fiber) {
    return;
  }
  const domParent = fiber.parent.dom;
  if (fiber.effectTag === 'PLACEMENT' && fiber.dom != null) {
    domParent.appendChild(fiber.dom);
  } else if (fiber.effectTag === 'DELETION') {
    domParent.removeChild(fiber.dom);
  } else if (fiber.effectTag === 'UPDATE' && fiber.dom != null) {
    updateDom(fiber.dom, fiber.alternate.props, fiber.props);
  }
  commitWork(fiber.child);
  commitWork(fiber.sibling);
}

/**
 * render function saves current iteration root fiber and starts workLoop
 */
function render(element, container) {
  wipRoot = {
    dom: container,
    props: {
      children: [element],
    },
    alternate: currentRoot,
  };
  deletions = [];
  nextUnitOfWork = wipRoot;
}

/**
 * wipRoot - work in progress root
 * currentRoot - root after commit
 * nextUnitOfWork - next target of performUnitOfWork
 * deletions - old nodes, that have been deleted from current iteration DOM
 */
let wipRoot = null;
let currentRoot = null;
let nextUnitOfWork = null;
let deletions = null;

/**
 * when browser can render and we have something to render, we render it by calling fiber render work
 */
function workLoop(deadline) {
  let shouldYield = false;
  while (nextUnitOfWork && !shouldYield) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    shouldYield = deadline.timeRemaining() < 1;
  }
  // if we ended our work, we commit changes
  if (!nextUnitOfWork && wipRoot) {
    commitRoot();
  }

  requestIdleCallback(workLoop);
}

requestIdleCallback(workLoop);

/**
 * this is main function of fiber logic
 * when we have fiber without dom object, we create it
 * then for every it's child we create new fiber (as this fiber right now)
 * then if current fiber has child, we repeat previous steps for it's child
 * then when we haven't got children
 * we repeat it for every fiber sibling
 * when we haven't got siblings, we go to parent and initiate it's siblings (uncle units)
 *
 * LOOK AT fiberStructure.png picture in README, the author explained fiber architecture incredible
 */
function performUnitOfWork(fiber) {
  if (!fiber.dom) {
    fiber.dom = createDOM(fiber);
  }

  const elements = fiber.props.children;
  //function, where children's fibers are created
  reconcileChildren(fiber, elements);

  if (fiber.child) {
    return fiber.child;
  }
  let nextFiber = fiber;
  while (nextFiber) {
    if (nextFiber.sibling) {
      return nextFiber.sibling;
    }
    nextFiber = nextFiber.parent;
  }
}

/**
 * function creates fibers and connects it with child-sibling logic
 * also it update or delete siblings
 */
function reconcileChildren(wipFiber, elements) {
  let index = 0;
  let oldFiber = wipFiber.alternate && wipFiber.alternate.child;
  let prevSibling = null;

  while (index < elements.length || oldFiber != null) {
    const element = elements[index];

    let newFiber = null;

    // we run over the fibers and old fibers and compare it
    const sameType = oldFiber && element && element.type == oldFiber.type;
    if (sameType) {
      newFiber = {
        type: oldFiber.type,
        props: element.props,
        dom: oldFiber.dom,
        parent: wipFiber,
        alternate: oldFiber,
        effectTag: 'UPDATE',
      };
    }
    if (element && !sameType) {
      newFiber = {
        type: element.type,
        props: element.props,
        dom: null,
        parent: wipFiber,
        alternate: null,
        effectTag: 'PLACEMENT',
      };
    }
    if (oldFiber && !sameType) {
      oldFiber.effectTag = 'DELETION';
      deletions.push(oldFiber);
    }

    if (oldFiber) {
      oldFiber = oldFiber.sibling;
    }

    if (index === 0) {
      wipFiber.child = newFiber;
    } else {
      prevSibling.sibling = newFiber;
    }

    prevSibling = newFiber;
    index++;
  }
}

/**
 * own React root object
 */
const EReactile = {
  createElement,
  render,
};

/**
 * parsed with custom EReactile.createElement jsx
 */
const element = (
  <div>
    <div>
      <div>
        <h1>There</h1>
        <h3>is</h3>
        <h6>loop...</h6>
      </div>
    </div>
    <h1>Hello World!</h1>
  </div>
);

const container = document.getElementById('root');

/**
 * libary's render
 */
EReactile.render(element, container);

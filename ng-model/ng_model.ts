import { Directive, EventEmitter, Host, Inject, Input, OnChanges, OnDestroy, Optional, Output, Self, SimpleChanges, forwardRef } from '@angular/core';

import { FormControl, FormHooks } from '../model';
import { NG_ASYNC_VALIDATORS, NG_VALIDATORS } from '../validators';

import { AbstractFormGroupDirective } from './abstract_form_group_directive';
import { ControlContainer } from './control_container';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from './control_value_accessor';
import { NgControl } from './ng_control';
import { NgForm } from './ng_form';
import { NgModelGroup } from './ng_model_group';
import { composeAsyncValidators, composeValidators, controlPath, isPropertyUpdated, selectValueAccessor, setUpControl } from './shared';
import { TemplateDrivenErrors } from './template_driven_errors';
import { AsyncValidator, AsyncValidatorFn, Validator, ValidatorFn } from './validators';

export const formControlBinding: any = {
  provide: NgControl,
  useExisting: forwardRef(() => NgModel)
};


const resolvedPromise = Promise.resolve(null);


@Directive({
  selector: '[ngModel]:not([formControlName]):not([formControl])',
  providers: [formControlBinding],
  exportAs: 'ngModel'
})
export class NgModel extends NgControl implements OnChanges,
  OnDestroy {
  /**初始化的时候新建的 */
  public readonly control: FormControl = new FormControl();
  /** @internal */
  _registered = false;

  /**可以视为是上一次的值 */
  viewModel: any;


  @Input() name !: string;


  @Input('disabled') isDisabled !: boolean;

  /**输入值 */
  @Input('ngModel') model: any;


  @Input('ngModelOptions')
  options !: { name?: string, standalone?: boolean, updateOn?: FormHooks };


  @Output('ngModelChange') update = new EventEmitter();

  constructor(
    /**应该是表单用 */
    @Optional() @Host() parent: ControlContainer,
    /**从dom中拿到验证同步指令 */
    @Optional() @Self() @Inject(NG_VALIDATORS) validators: Array<Validator | ValidatorFn>,
    @Optional() @Self() @Inject(NG_ASYNC_VALIDATORS) asyncValidators: Array<AsyncValidator | AsyncValidatorFn>,
    @Optional() @Self() @Inject(NG_VALUE_ACCESSOR)
    valueAccessors: ControlValueAccessor[]) {
    super();
    this._parent = parent;
    this._rawValidators = validators || [];
    this._rawAsyncValidators = asyncValidators || [];
    this.valueAccessor = selectValueAccessor(this, valueAccessors);
  }


  /**
   * input 值变化后看看是不是应该更新这个值
   * 

   * @date 2019-05-05
   * @param changes
   */
  ngOnChanges(changes: SimpleChanges) {
    this._checkForErrors();
    if (!this._registered) this._setUpControl();
    if ('isDisabled' in changes) {
      this._updateDisabled(changes);
    }

    if (isPropertyUpdated(changes, this.viewModel)) {
      //doc 更新值
      this._updateValue(this.model);
      this.viewModel = this.model;
    }
  }

  /**如果是表单的,销毁时要移除 */
  ngOnDestroy(): void { this.formDirective && this.formDirective.removeControl(this); }


  get path(): string[] {
    return this._parent ? controlPath(this.name, this._parent) : [this.name];
  }


  get formDirective(): any { return this._parent ? this._parent.formDirective : null; }

  /**构造函数传进来的验证 */
  get validator(): ValidatorFn | null { return composeValidators(this._rawValidators); }


  get asyncValidator(): AsyncValidatorFn | null {
    return composeAsyncValidators(this._rawAsyncValidators);
  }


  /**
   * 更新了值
   * ! 应该是外部调用过这里
   * 告知外界更新

   * @date 2019-05-05
   * @param newValue
   */
  viewToModelUpdate(newValue: any): void {
    this.viewModel = newValue;
    this.update.emit(newValue);
  }

  /**
   * 在input变更时调用,只调用一次
   * 设置

   * @date 2019-05-05
   * @private
   */
  private _setUpControl(): void {
    this._setUpdateStrategy();
    //doc 如果是非独立的添加到表单控制中
    this._isStandalone() ? this._setUpStandalone() :
      this.formDirective.addControl(this);
    this._registered = true;
  }

  /**
   * 设置更新策略,是变更时更新,失去焦点更新还是提交时更新
   *

   * @date 2019-05-05
   * @private
   */
  private _setUpdateStrategy(): void {
    if (this.options && this.options.updateOn != null) {
      this.control._updateOn = this.options.updateOn;
    }
  }

  /**
   * 是不是独立的,如果没有父或者设置了独立那么返回true
   *

   * @date 2019-05-05
   * @private
   * @returns 如果是独立的返回true
   */
  private _isStandalone(): boolean {
    return !this._parent || !!(this.options && this.options.standalone);
  }

  /**
   * 如果是独立的那么才设置
   *

   * @date 2019-05-06
   * @private
   */
  private _setUpStandalone(): void {
    setUpControl(this.control, this);
    //doc 不发出事件
    this.control.updateValueAndValidity({ emitEvent: false });
  }

  /**
   * 检查是否报错
   *

   * @date 2019-05-05
   * @private
   */
  private _checkForErrors(): void {
    if (!this._isStandalone()) {
      this._checkParentType();
    }
    this._checkName();
  }

  /**
   * 判断父的类型
   * 如果什么都不是报错
   *

   * @date 2019-05-05
   * @private
   */
  private _checkParentType(): void {
    if (!(this._parent instanceof NgModelGroup) &&
      this._parent instanceof AbstractFormGroupDirective) {
      TemplateDrivenErrors.formGroupNameException();
    } else if (
      !(this._parent instanceof NgModelGroup) && !(this._parent instanceof NgForm)) {
      TemplateDrivenErrors.modelParentException();
    }
  }

  /**
   * 检查名字,如果选项中有名字取选项中的,如果不是独立,并且没名字,那么抛出异常
   *

   * @date 2019-05-05
   * @private
   */
  private _checkName(): void {
    if (this.options && this.options.name) this.name = this.options.name;

    if (!this._isStandalone() && !this.name) {
      TemplateDrivenErrors.missingNameException();
    }
  }

  /**
   * 非同步更新,会在队列空的时候才执行
   *

   * @date 2019-05-05
   * @private
   * @param value
   */
  private _updateValue(value: any): void {
    resolvedPromise.then(
      //doc 触发视图到模型变更
      () => { this.control.setValue(value, { emitViewToModelChange: false }); });
  }

  /**
   * 禁用或者启用,非同步启用/禁用
   *

   * @date 2019-05-05
   * @private
   * @param changes
   */
  private _updateDisabled(changes: SimpleChanges) {
    const disabledValue = changes['isDisabled'].currentValue;

    const isDisabled =
      disabledValue === '' || (disabledValue && disabledValue !== 'false');

    resolvedPromise.then(() => {
      if (isDisabled && !this.control.disabled) {
        this.control.disable();
      } else if (!isDisabled && this.control.disabled) {
        this.control.enable();
      }
    });
  }
}

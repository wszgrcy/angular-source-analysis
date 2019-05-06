/**
 * 
 */

import { isDevMode, ɵlooseIdentical as looseIdentical } from '@angular/core';

import { FormArray, FormControl, FormGroup } from '../model';
import { Validators } from '../validators';
import { AbstractControlDirective } from './abstract_control_directive';
import { AbstractFormGroupDirective } from './abstract_form_group_directive';
import { CheckboxControlValueAccessor } from './checkbox_value_accessor';
import { ControlContainer } from './control_container';
import { ControlValueAccessor } from './control_value_accessor';
import { DefaultValueAccessor } from './default_value_accessor';
import { NgControl } from './ng_control';
import { normalizeAsyncValidator, normalizeValidator } from './normalize_validator';
import { NumberValueAccessor } from './number_value_accessor';
import { RadioControlValueAccessor } from './radio_control_value_accessor';
import { RangeValueAccessor } from './range_value_accessor';
import { FormArrayName } from './reactive_directives/form_group_name';
import { ReactiveErrors } from './reactive_errors';
import { SelectControlValueAccessor } from './select_control_value_accessor';
import { SelectMultipleControlValueAccessor } from './select_multiple_control_value_accessor';
import { AsyncValidator, AsyncValidatorFn, Validator, ValidatorFn } from './validators';


export function controlPath(name: string, parent: ControlContainer): string[] {
  return [...parent.path!, name];
}

/**
 *
 *

 * @date 2019-05-05
 * @export
 * @param control ngmodel里的control
 * @param dir ngmodel里的this
 */
export function setUpControl(control: FormControl, dir: NgControl): void {
  if (!control) _throwError(dir, 'Cannot find control with');
  if (!dir.valueAccessor) _throwError(dir, 'No value accessor for form control with');
  //doc 把ngmodel里的表单控制和构造里面的合并
  control.validator = Validators.compose([control.validator!, dir.validator]);
  control.asyncValidator = Validators.composeAsync([control.asyncValidator!, dir.asyncValidator]);
  //doc 告知控件写入了一个值,由于第一次变更时是在control赋值前调用,所以是null(初始化的表单控件value就是null)
  dir.valueAccessor!.writeValue(control.value);
  //doc 把值变更调用函数传入到指令中
  setUpViewChangePipeline(control, dir);
  setUpModelChangePipeline(control, dir);

  setUpBlurPipeline(control, dir);
  //doc 设置禁用时回调
  if (dir.valueAccessor!.setDisabledState) {
    control.registerOnDisabledChange(
      (isDisabled: boolean) => { dir.valueAccessor!.setDisabledState!(isDisabled); });
  }
  //doc 验证器
  // re-run validation when validator binding changes, e.g. minlength=3 -> minlength=4
  dir._rawValidators.forEach((validator: Validator | ValidatorFn) => {
    if ((<Validator>validator).registerOnValidatorChange)
      (<Validator>validator).registerOnValidatorChange!(() => control.updateValueAndValidity());
  });

  dir._rawAsyncValidators.forEach((validator: AsyncValidator | AsyncValidatorFn) => {
    if ((<Validator>validator).registerOnValidatorChange)
      (<Validator>validator).registerOnValidatorChange!(() => control.updateValueAndValidity());
  });
}

export function cleanUpControl(control: FormControl, dir: NgControl) {
  dir.valueAccessor!.registerOnChange(() => _noControlError(dir));
  dir.valueAccessor!.registerOnTouched(() => _noControlError(dir));

  dir._rawValidators.forEach((validator: any) => {
    if (validator.registerOnValidatorChange) {
      validator.registerOnValidatorChange(null);
    }
  });

  dir._rawAsyncValidators.forEach((validator: any) => {
    if (validator.registerOnValidatorChange) {
      validator.registerOnValidatorChange(null);
    }
  });

  if (control) control._clearChangeFns();
}

/**
 * 设置视图变更
 *

 * @date 2019-05-05
 * @param control
 * @param dir
 */
function setUpViewChangePipeline(control: FormControl, dir: NgControl): void {
  //doc 调用方法传一个函数,这个函数是当值变更时,控件内调用这个函数触发变更的
  dir.valueAccessor!.registerOnChange((newValue: any) => {
    //doc 收到值但是还没赋值
    control._pendingValue = newValue;
    control._pendingChange = true;
    control._pendingDirty = true;
    //doc 如果控件更新策略是变更就更新,那么调用更新空间
    if (control.updateOn === 'change') updateControl(control, dir);
  });
}

function setUpBlurPipeline(control: FormControl, dir: NgControl): void {
  dir.valueAccessor!.registerOnTouched(() => {
    control._pendingTouched = true;

    if (control.updateOn === 'blur' && control._pendingChange) updateControl(control, dir);
    if (control.updateOn !== 'submit') control.markAsTouched();
  });
}
/**更新值,可因值改变被控件调用触发 */
function updateControl(control: FormControl, dir: NgControl): void {
  //doc 值已被改变,置为脏
  if (control._pendingDirty) control.markAsDirty();
  //doc 设置值,但是不发生模型到视图的变更事件/触发ngModelChange
  control.setValue(control._pendingValue, { emitModelToViewChange: false });
  dir.viewToModelUpdate(control._pendingValue);
  //doc 赋值完成
  control._pendingChange = false;
}

/**更新值 */
/**
 * 模型变更
 *

 * @date 2019-05-05
 * @param control
 * @param dir
 */
function setUpModelChangePipeline(control: FormControl, dir: NgControl): void {
  //doc 如果控件发出了值变更的函数
  //doc 这里就是如果不是view改变,也不是model改变,而是通过指令里的表单控件设置,那么会更新到view,同时视情况更新到ngmodel外界
  
  control.registerOnChange((newValue: any, /**由emitViewToModelChange控制 */emitModelEvent: boolean) => {
    //doc 发出 外界写入值
    // control -> view
    dir.valueAccessor!.writeValue(newValue);
    //doc 如果需要告知外界值更新
    // control -> ngModel
    if (emitModelEvent) dir.viewToModelUpdate(newValue);
  });
}

export function setUpFormContainer(
  control: FormGroup | FormArray, dir: AbstractFormGroupDirective | FormArrayName) {
  if (control == null) _throwError(dir, 'Cannot find control with');
  control.validator = Validators.compose([control.validator, dir.validator]);
  control.asyncValidator = Validators.composeAsync([control.asyncValidator, dir.asyncValidator]);
}

function _noControlError(dir: NgControl) {
  return _throwError(dir, 'There is no FormControl instance attached to form control element with');
}

function _throwError(dir: AbstractControlDirective, message: string): void {
  let messageEnd: string;
  //dir.path是表单到控件的路径
  if (dir.path!.length > 1) {
    messageEnd = `path: '${dir.path!.join(' -> ')}'`;
  } else if (dir.path![0]) {
    messageEnd = `name: '${dir.path}'`;
  } else {
    messageEnd = 'unspecified name attribute';
  }
  throw new Error(`${message} ${messageEnd}`);
}

export function composeValidators(validators: Array<Validator | Function>): ValidatorFn | null {
  return validators != null ? Validators.compose(validators.map(normalizeValidator)) : null;
}

export function composeAsyncValidators(validators: Array<Validator | Function>): AsyncValidatorFn |
  null {
  return validators != null ? Validators.composeAsync(validators.map(normalizeAsyncValidator)) :
    null;
}

/**
 *
 *

 * @date 2019-05-05
 * @export
 * @param changes 传入的`SimpleChanges`实例
 * @param viewModel 双向绑定更新值
 * @returns 返回是不是更新,如果不相等或者第一次那么更新
 */
export function isPropertyUpdated(changes: { [key: string]: any }, viewModel: any): boolean {
  /**model是双向绑定的值 */
  if (!changes.hasOwnProperty('model')) return false;
  /**`SimpleChange` 实例 */
  const change = changes['model'];

  if (change.isFirstChange()) return true;
  return !looseIdentical(viewModel, change.currentValue);
}

const BUILTIN_ACCESSORS = [
  CheckboxControlValueAccessor,
  RangeValueAccessor,
  NumberValueAccessor,
  SelectControlValueAccessor,
  SelectMultipleControlValueAccessor,
  RadioControlValueAccessor,
];

export function isBuiltInAccessor(valueAccessor: ControlValueAccessor): boolean {
  return BUILTIN_ACCESSORS.some(a => valueAccessor.constructor === a);
}
/**更新了值 */
export function syncPendingControls(form: FormGroup, directives: NgControl[]): void {
  form._syncPendingControls();
  directives.forEach(dir => {
    const control = dir.control as FormControl;
    if (control.updateOn === 'submit' && control._pendingChange) {
      dir.viewToModelUpdate(control._pendingValue);
      control._pendingChange = false;
    }
  });
}

// TODO: vsavkin remove it once https://github.com/angular/angular/issues/3011 is implemented
/**
 * 从数组中找到自己的控制器
 * @param dir 
 * @param valueAccessors 
 */
export function selectValueAccessor(
  dir: NgControl, valueAccessors: ControlValueAccessor[]): ControlValueAccessor | null {
  if (!valueAccessors) return null;

  if (!Array.isArray(valueAccessors))
    _throwError(dir, 'Value accessor was not provided as an array for form control with');

  let defaultAccessor: ControlValueAccessor | undefined = undefined;
  let builtinAccessor: ControlValueAccessor | undefined = undefined;
  let customAccessor: ControlValueAccessor | undefined = undefined;

  valueAccessors.forEach((v: ControlValueAccessor) => {
    /**这个是ngModel默认的ValueAccessor */
    if (v.constructor === DefaultValueAccessor) {
      defaultAccessor = v;

    } else if (isBuiltInAccessor(v)) {
      if (builtinAccessor)
        _throwError(dir, 'More than one built-in value accessor matches form control with');
      builtinAccessor = v;

    } else {
      if (customAccessor)
        _throwError(dir, 'More than one custom value accessor matches form control with');
      customAccessor = v;
    }
  });
  //doc 有优先级,自定义,预设,默认
  if (customAccessor) return customAccessor;
  if (builtinAccessor) return builtinAccessor;
  if (defaultAccessor) return defaultAccessor;

  _throwError(dir, 'No valid value accessor for form control with');
  return null;
}

export function removeDir<T>(list: T[], el: T): void {
  const index = list.indexOf(el);
  if (index > -1) list.splice(index, 1);
}

// TODO(kara): remove after deprecation period
export function _ngModelWarning(
  name: string, type: { _ngModelWarningSentOnce: boolean },
  instance: { _ngModelWarningSent: boolean }, warningConfig: string | null) {
  if (!isDevMode() || warningConfig === 'never') return;

  if (((warningConfig === null || warningConfig === 'once') && !type._ngModelWarningSentOnce) ||
    (warningConfig === 'always' && !instance._ngModelWarningSent)) {
    ReactiveErrors.ngModelWarning(name);
    type._ngModelWarningSentOnce = true;
    instance._ngModelWarningSent = true;
  }
}

/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import { Directive, ElementRef, Inject, InjectionToken, Optional, Renderer2, forwardRef } from '@angular/core';
import { ɵgetDOM as getDOM } from '@angular/platform-browser';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from './control_value_accessor';

export const DEFAULT_VALUE_ACCESSOR: any = {
  provide: NG_VALUE_ACCESSOR,
  useExisting: forwardRef(() => DefaultValueAccessor),
  multi: true
};

/**
 * We must check whether the agent is Android because composition events
 * behave differently between iOS and Android.
 */
function _isAndroid(): boolean {
  const userAgent = getDOM() ? getDOM().getUserAgent() : '';
  return /android (\d+)/.test(userAgent.toLowerCase());
}

/**
 * @description
 * Provide this token to control if form directives buffer IME input until
 * the "compositionend" event occurs.
 * @publicApi
 */
export const COMPOSITION_BUFFER_MODE = new InjectionToken<boolean>('CompositionEventMode');

/**
 * @description
 * The default `ControlValueAccessor` for writing a value and listening to changes on input
 * elements. The accessor is used by the `FormControlDirective`, `FormControlName`, and
 * `NgModel` directives.
 *
 * @usageNotes
 *
 * ### Using the default value accessor
 *
 * The following example shows how to use an input element that activates the default value accessor
 * (in this case, a text field).
 *
 * ```ts
 * const firstNameControl = new FormControl();
 * ```
 *
 * ```
 * <input type="text" [formControl]="firstNameControl">
 * ```
 *
 * @ngModule ReactiveFormsModule
 * @ngModule FormsModule
 * @publicApi
 */
@Directive({
  selector:
    'input:not([type=checkbox])[formControlName],textarea[formControlName],input:not([type=checkbox])[formControl],textarea[formControl],input:not([type=checkbox])[ngModel],textarea[ngModel],[ngDefaultControl]',
  // TODO: vsavkin replace the above selector with the one below it once
  // https://github.com/angular/angular/issues/3011 is implemented
  // selector: '[ngModel],[formControl],[formControlName]',
  host: {
    '(input)': '$any(this)._handleInput($event.target.value)',
    '(blur)': 'onTouched()',
    '(compositionstart)': '$any(this)._compositionStart()',
    '(compositionend)': '$any(this)._compositionEnd($event.target.value)'
  },
  providers: [DEFAULT_VALUE_ACCESSOR]
})
export class DefaultValueAccessor implements ControlValueAccessor {
  /**
   * @description
   * The registered callback function called when an input event occurs on the input element.
   * input 调用,compositionend调用
   * 
   * 
   */
  onChange = (_: any) => { };

  /**
   * @description
   * The registered callback function called when a blur event occurs on the input element.
   * 失去焦点调用,不管是移动端还是pc端
   */
  onTouched = () => { };

  /** Whether the user is creating a composition string (IME events). */
  private _composing = false;

  constructor(
    private _renderer: Renderer2, private _elementRef: ElementRef,
    @Optional() @Inject(COMPOSITION_BUFFER_MODE) private _compositionMode: boolean) {
    if (this._compositionMode == null) {
      this._compositionMode = !_isAndroid();
    }
  }

  /**
   * Sets the "value" property on the input element.
   * 用angular自带的渲染器赋值
   * @param value The checked value
   */
  writeValue(value: any): void {
    const normalizedValue = value == null ? '' : value;
    this._renderer.setProperty(this._elementRef.nativeElement, 'value', normalizedValue);
  }

  /**
   * @description
   * Registers a function called when the control value changes.
   * 
   * @param fn  这个函数调用时,1.会给表单控件赋值,2.表单控件标记为脏 传入位置`shared.ts#setUpViewChangePipeline`
   */
  registerOnChange(fn: (_: any) => void): void { this.onChange = fn; }

  /**
   * @description
   * Registers a function called when the control is touched.
   *
   * @param fn The callback function
   */
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }

  /**
   * Sets the "disabled" property on the input element.
   *
   * @param isDisabled The disabled value
   */
  setDisabledState(isDisabled: boolean): void {
    this._renderer.setProperty(this._elementRef.nativeElement, 'disabled', isDisabled);
  }

  /** @internal */
  /**
   * input 事件绑定
   * 如果组合模式是false或者没有正在组合,那么方法会调用
   * @author cyia
   * @date 2019-05-06
   * @param value
   */
  _handleInput(value: any): void {
    if (!this._compositionMode || (this._compositionMode && !this._composing)) {
      this.onChange(value);
    }
  }

  /** @internal */
  /**
   * 同名事件,表示正在组合
   *
   * @author cyia
   * @date 2019-05-06
   */
  _compositionStart(): void { this._composing = true; }

  /** @internal */
  /**
   * 组合结束
   *
   * @author cyia
   * @date 2019-05-06
   * @param value
   */
  _compositionEnd(value: any): void {
    this._composing = false;
    this._compositionMode && this.onChange(value);
  }
}

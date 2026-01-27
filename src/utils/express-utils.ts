/**
 * Utility functions for handling Express request types
 */
import { ParamsDictionary, Query } from 'express-serve-static-core';

/**
 * Converts a string | string[] | undefined to a single string
 */
export function toString(value: string | string[] | undefined): string {
  if (value === undefined) return '';
  return Array.isArray(value) ? (value[0] ?? '') : value;
}

/**
 * Converts a string | string[] to an array of strings
 */
export function toStringArray(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

/**
 * Typed request interfaces for better type safety
 */
export interface TypedRequest<TParams extends ParamsDictionary = ParamsDictionary, TQuery extends Query = Query> {
  params: TParams;
  query: TQuery;
}

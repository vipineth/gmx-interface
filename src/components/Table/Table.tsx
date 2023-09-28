import React from "react";
import isObject from "lodash/isObject";
import { t } from "@lingui/macro";
import cx from "classnames";
import Tooltip from "../Tooltip/Tooltip";
import { TableCellData, TableCellProps, TableHeaderProps, TableProps } from "./types";

import "./Table.css";
import { createBreakpoint } from "react-use";

export default function Table<T extends Record<string, any>>({
  isLoading,
  error,
  content,
  titles,
  rowKey,
  className,
}: TableProps<T>) {
  let errorMsg: string | null = null;
  if (error) {
    errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
  }
  const useBreakpoint = createBreakpoint({ XL: 1200, L: 1000, M: 800, S: 500 });
  const breakpoint = useBreakpoint();
  return (
    <div className="TableBox">
      <table className={cx("Exchange-list", "App-box", "Table", className)}>
        <tbody>
          <tr className="Exchange-list-header">
            {Object.entries(titles)
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <TableHeader key={`table_header_${k}`} breakpoint={breakpoint} data={v!} />
              ))}
          </tr>
          {isLoading ? (
            <tr>
              <td>{t`Loading...`}</td>
            </tr>
          ) : error ? (
            <tr>
              <td>{t`Error` + ": " + errorMsg}</td>
            </tr>
          ) : !content.length ? (
            <tr>
              <td>{t`No data yet`}</td>
            </tr>
          ) : (
            content.map((row: T) => (
              <tr key={row[rowKey]}>
                {Object.keys(titles).map((k) => (
                  <TableCell key={`${row[rowKey]}_${k}`} breakpoint={breakpoint} data={row[k]} />
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

const TableHeader = ({ data, breakpoint }: TableHeaderProps) => {
  const { onClick, className, tooltip, width, title } = data;
  const style = width
    ? {
        width: `${typeof width === "function" ? width(breakpoint) : width}%`,
      }
    : undefined;

  return (
    <th onClick={onClick} className={cx("TableHeader", className)} style={style}>
      {tooltip ? (
        <Tooltip
          handle={<span className="TableHeaderTitle">{title}</span>}
          isPopupClickable={false}
          position="right-bottom"
          className="TableHeaderTooltip"
          renderContent={typeof tooltip === "function" ? tooltip : () => <p>{tooltip}</p>}
        />
      ) : (
        <span className="TableHeaderTitle">{title}</span>
      )}
    </th>
  );
};

const TableCell = ({ data, breakpoint }: TableCellProps) => {
  const isObj = isObject(data);
  const cellClassName = cx(isObj && (data as TableCellData).className);
  let content;
  if (isObj) {
    const { value } = data as TableCellData;
    content = typeof value === "function" ? value(breakpoint) : value;
  } else {
    content = data;
  }

  return <td className={cellClassName}>{content}</td>;
};
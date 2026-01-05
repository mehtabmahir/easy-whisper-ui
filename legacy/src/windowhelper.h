#ifndef WINDOWHELPER_H
#define WINDOWHELPER_H

#pragma once

#include <QObject>
#include <QEvent>
#include <QDropEvent>

QT_BEGIN_NAMESPACE
namespace Ui { class EasyWhisperUI; }
QT_END_NAMESPACE

class WindowHelper : public QObject
{
    Q_OBJECT
public:
    WindowHelper(QWidget *window, Ui::EasyWhisperUI *ui, QObject *parent = nullptr);

    void handleBlur();
    void handlePaletteChange(QEvent *event);
    void handleDragEnter(QDragEnterEvent *event);
    QStringList handleDrop(QDropEvent *event);

private:
    QWidget *window;
    Ui::EasyWhisperUI *ui;
};


#endif // WINDOWHELPER_H

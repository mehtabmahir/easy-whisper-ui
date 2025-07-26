#ifndef LIVETRANSCRIBER_H
#define LIVETRANSCRIBER_H

#pragma once
#include <QObject>
#include <QProcess>

class LiveTranscriber : public QObject
{
    Q_OBJECT
public:
    explicit LiveTranscriber(QObject *parent = nullptr);

    void start(const QString &modelPath,
               const QString &lang,
               bool cpuOnly,
               int stepMs  = 500,
               int lengthMs = 5000);
    void stop();

signals:
    void newText(const QString &line);   // each chunk from stdout
    void finished();                     // process exited

private:
    QProcess proc;
};

#endif // LIVETRANSCRIBER_H
